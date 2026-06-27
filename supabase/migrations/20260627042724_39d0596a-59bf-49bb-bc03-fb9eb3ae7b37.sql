
-- =========================================================
-- T.1 — Etiquetas/Tags
-- =========================================================

-- 1) tags
CREATE TABLE IF NOT EXISTS public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT ALL ON public.tags TO service_role;

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS tags_unique_active_name_per_company
  ON public.tags(company_id, lower(name))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS tags_company_idx ON public.tags(company_id) WHERE deleted_at IS NULL;

CREATE TRIGGER update_tags_updated_at BEFORE UPDATE ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- helper: is admin-ish (master/owner/admin/manager) within company
CREATE OR REPLACE FUNCTION public._tags_can_manage(_uid uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT is_master OR global_role = 'master' FROM public.profiles WHERE id = _uid), false)
    OR EXISTS (
      SELECT 1 FROM public.company_users
      WHERE user_id = _uid AND company_id = _company_id AND status = 'active'
        AND role IN ('owner','admin','manager')
    )
$$;

-- RLS tags
CREATE POLICY "tags_select_company_members"
  ON public.tags FOR SELECT TO authenticated
  USING (
    COALESCE((SELECT is_master OR global_role='master' FROM public.profiles WHERE id = auth.uid()), false)
    OR public.user_belongs_to_company(auth.uid(), company_id)
  );

CREATE POLICY "tags_insert_managers"
  ON public.tags FOR INSERT TO authenticated
  WITH CHECK (public._tags_can_manage(auth.uid(), company_id));

CREATE POLICY "tags_update_managers"
  ON public.tags FOR UPDATE TO authenticated
  USING (public._tags_can_manage(auth.uid(), company_id))
  WITH CHECK (public._tags_can_manage(auth.uid(), company_id));

CREATE POLICY "tags_delete_managers"
  ON public.tags FOR DELETE TO authenticated
  USING (public._tags_can_manage(auth.uid(), company_id));

-- 2) tag_links
CREATE TABLE IF NOT EXISTS public.tag_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('contact','ticket','opportunity')),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (
    (entity_type='contact'     AND contact_id IS NOT NULL     AND ticket_id IS NULL AND opportunity_id IS NULL) OR
    (entity_type='ticket'      AND ticket_id IS NOT NULL      AND contact_id IS NULL AND opportunity_id IS NULL) OR
    (entity_type='opportunity' AND opportunity_id IS NOT NULL AND contact_id IS NULL AND ticket_id IS NULL)
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tag_links TO authenticated;
GRANT ALL ON public.tag_links TO service_role;

ALTER TABLE public.tag_links ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS tag_links_unique_contact
  ON public.tag_links(company_id, tag_id, contact_id)
  WHERE contact_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tag_links_unique_ticket
  ON public.tag_links(company_id, tag_id, ticket_id)
  WHERE ticket_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tag_links_unique_opportunity
  ON public.tag_links(company_id, tag_id, opportunity_id)
  WHERE opportunity_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS tag_links_contact_idx     ON public.tag_links(contact_id)     WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tag_links_ticket_idx      ON public.tag_links(ticket_id)      WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tag_links_opportunity_idx ON public.tag_links(opportunity_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tag_links_tag_idx         ON public.tag_links(tag_id)         WHERE deleted_at IS NULL;

-- Validate same company between tag and entity
CREATE OR REPLACE FUNCTION public.tag_links_validate_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _tag_company uuid;
  _ent_company uuid;
BEGIN
  SELECT company_id INTO _tag_company FROM public.tags WHERE id = NEW.tag_id AND deleted_at IS NULL;
  IF _tag_company IS NULL THEN RAISE EXCEPTION 'tag not found'; END IF;
  IF _tag_company <> NEW.company_id THEN RAISE EXCEPTION 'tag belongs to another company'; END IF;

  IF NEW.entity_type = 'contact' THEN
    SELECT company_id INTO _ent_company FROM public.contacts WHERE id = NEW.contact_id;
  ELSIF NEW.entity_type = 'ticket' THEN
    SELECT company_id INTO _ent_company FROM public.tickets WHERE id = NEW.ticket_id;
  ELSIF NEW.entity_type = 'opportunity' THEN
    SELECT company_id INTO _ent_company FROM public.opportunities WHERE id = NEW.opportunity_id;
  END IF;
  IF _ent_company IS NULL THEN RAISE EXCEPTION 'entity not found'; END IF;
  IF _ent_company <> NEW.company_id THEN RAISE EXCEPTION 'entity belongs to another company'; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER tag_links_validate_company_trg
  BEFORE INSERT OR UPDATE ON public.tag_links
  FOR EACH ROW EXECUTE FUNCTION public.tag_links_validate_company();

-- RLS tag_links (read: company members; write: via RPCs preferred, but allow same-company writes;
-- entity-level permission enforcement done in RPCs)
CREATE POLICY "tag_links_select_company"
  ON public.tag_links FOR SELECT TO authenticated
  USING (
    COALESCE((SELECT is_master OR global_role='master' FROM public.profiles WHERE id = auth.uid()), false)
    OR public.user_belongs_to_company(auth.uid(), company_id)
  );

-- Insert/update/delete restricted to managers via direct table access; agents use RPC.
CREATE POLICY "tag_links_write_managers"
  ON public.tag_links FOR ALL TO authenticated
  USING (public._tags_can_manage(auth.uid(), company_id))
  WITH CHECK (public._tags_can_manage(auth.uid(), company_id));

-- 3) Helper: can user access entity?
CREATE OR REPLACE FUNCTION public._tags_can_access_entity(
  _uid uuid, _company_id uuid, _entity_type text,
  _contact_id uuid, _ticket_id uuid, _opportunity_id uuid
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _is_master boolean;
  _role company_user_role;
  _ticket public.tickets%ROWTYPE;
  _opp public.opportunities%ROWTYPE;
BEGIN
  SELECT COALESCE(is_master OR global_role='master', false) INTO _is_master FROM public.profiles WHERE id=_uid;
  IF _is_master THEN RETURN true; END IF;
  SELECT role INTO _role FROM public.company_users
    WHERE user_id=_uid AND company_id=_company_id AND status='active';
  IF _role IS NULL THEN RETURN false; END IF;
  IF _role IN ('owner','admin') THEN RETURN true; END IF;

  IF _entity_type = 'contact' THEN
    -- contacts: any active member of the company can view/apply tags
    RETURN EXISTS (SELECT 1 FROM public.contacts WHERE id=_contact_id AND company_id=_company_id);
  ELSIF _entity_type = 'ticket' THEN
    SELECT * INTO _ticket FROM public.tickets WHERE id=_ticket_id AND company_id=_company_id;
    IF NOT FOUND THEN RETURN false; END IF;
    IF _role = 'manager' THEN
      IF _ticket.department_id IS NULL THEN RETURN true; END IF;
      RETURN EXISTS (
        SELECT 1 FROM public.department_users
        WHERE user_id=_uid AND company_id=_company_id
          AND department_id=_ticket.department_id AND status='active'
      );
    ELSE -- agent / financial
      IF _ticket.assigned_user_id = _uid THEN RETURN true; END IF;
      IF _ticket.department_id IS NULL THEN RETURN false; END IF;
      RETURN EXISTS (
        SELECT 1 FROM public.department_users
        WHERE user_id=_uid AND company_id=_company_id
          AND department_id=_ticket.department_id AND status='active'
      );
    END IF;
  ELSIF _entity_type = 'opportunity' THEN
    SELECT * INTO _opp FROM public.opportunities WHERE id=_opportunity_id AND company_id=_company_id;
    IF NOT FOUND THEN RETURN false; END IF;
    IF _role = 'manager' THEN RETURN true; END IF;
    RETURN _opp.assigned_user_id = _uid OR _opp.created_by = _uid;
  END IF;
  RETURN false;
END $$;

-- 4) RPC apply_tag_to_entity
CREATE OR REPLACE FUNCTION public.apply_tag_to_entity(
  _company_id uuid, _tag_id uuid, _entity_type text,
  _contact_id uuid DEFAULT NULL, _ticket_id uuid DEFAULT NULL, _opportunity_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _link_id uuid;
  _existing uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF _entity_type NOT IN ('contact','ticket','opportunity') THEN
    RAISE EXCEPTION 'invalid entity_type';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tags WHERE id=_tag_id AND company_id=_company_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'tag not found';
  END IF;
  IF NOT public._tags_can_access_entity(_uid, _company_id, _entity_type, _contact_id, _ticket_id, _opportunity_id) THEN
    RAISE EXCEPTION 'forbidden_entity';
  END IF;

  -- reactivate if soft-deleted exists
  SELECT id INTO _existing FROM public.tag_links
    WHERE company_id=_company_id AND tag_id=_tag_id
      AND ((_entity_type='contact'     AND contact_id=_contact_id)
        OR (_entity_type='ticket'      AND ticket_id=_ticket_id)
        OR (_entity_type='opportunity' AND opportunity_id=_opportunity_id))
    ORDER BY (deleted_at IS NULL) DESC, created_at DESC
    LIMIT 1;

  IF _existing IS NOT NULL THEN
    UPDATE public.tag_links SET deleted_at=NULL WHERE id=_existing;
    _link_id := _existing;
  ELSE
    INSERT INTO public.tag_links(company_id, tag_id, entity_type, contact_id, ticket_id, opportunity_id, created_by)
    VALUES (_company_id, _tag_id, _entity_type, _contact_id, _ticket_id, _opportunity_id, _uid)
    RETURNING id INTO _link_id;
  END IF;

  INSERT INTO public.audit_logs(company_id, event_type, ticket_id, changed_by, metadata)
  VALUES (_company_id, 'tag.applied', _ticket_id, _uid,
    jsonb_build_object('tag_id',_tag_id,'entity_type',_entity_type,
      'contact_id',_contact_id,'ticket_id',_ticket_id,'opportunity_id',_opportunity_id,
      'source','tags'));
  RETURN _link_id;
END $$;

-- 5) RPC remove_tag_from_entity
CREATE OR REPLACE FUNCTION public.remove_tag_from_entity(
  _company_id uuid, _tag_id uuid, _entity_type text,
  _contact_id uuid DEFAULT NULL, _ticket_id uuid DEFAULT NULL, _opportunity_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public._tags_can_access_entity(_uid, _company_id, _entity_type, _contact_id, _ticket_id, _opportunity_id) THEN
    RAISE EXCEPTION 'forbidden_entity';
  END IF;
  UPDATE public.tag_links
     SET deleted_at = now()
   WHERE company_id=_company_id AND tag_id=_tag_id AND deleted_at IS NULL
     AND ((_entity_type='contact'     AND contact_id=_contact_id)
       OR (_entity_type='ticket'      AND ticket_id=_ticket_id)
       OR (_entity_type='opportunity' AND opportunity_id=_opportunity_id));

  INSERT INTO public.audit_logs(company_id, event_type, ticket_id, changed_by, metadata)
  VALUES (_company_id, 'tag.removed', _ticket_id, _uid,
    jsonb_build_object('tag_id',_tag_id,'entity_type',_entity_type,
      'contact_id',_contact_id,'ticket_id',_ticket_id,'opportunity_id',_opportunity_id,
      'source','tags'));
END $$;

REVOKE ALL ON FUNCTION public.apply_tag_to_entity(uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_tag_from_entity(uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_tag_to_entity(uuid,uuid,text,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_tag_from_entity(uuid,uuid,text,uuid,uuid,uuid) TO authenticated;

-- 6) Audit on tag CRUD
CREATE OR REPLACE FUNCTION public.tags_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _evt text;
BEGIN
  IF TG_OP = 'INSERT' THEN _evt := 'tag.created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN _evt := 'tag.deleted';
    ELSE _evt := 'tag.updated'; END IF;
  ELSIF TG_OP = 'DELETE' THEN _evt := 'tag.deleted';
  END IF;
  INSERT INTO public.audit_logs(company_id, event_type, changed_by, metadata)
  VALUES (COALESCE(NEW.company_id, OLD.company_id), _evt, auth.uid(),
    jsonb_build_object('tag_id', COALESCE(NEW.id, OLD.id),
      'name', COALESCE(NEW.name, OLD.name),
      'color', COALESCE(NEW.color, OLD.color),
      'source','tags'));
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER tags_audit_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.tags_audit();
