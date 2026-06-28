
-- ============================================================
-- T.2 — Tag automations: move_kanban_card on tag_applied
-- ============================================================

-- 1) tag_automations
CREATE TABLE IF NOT EXISTS public.tag_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  name text,
  is_active boolean NOT NULL DEFAULT true,
  event_type text NOT NULL DEFAULT 'tag_applied',
  entity_type text NOT NULL DEFAULT 'ticket',
  action_type text NOT NULL DEFAULT 'move_kanban_card',
  target_kanban_lane_id uuid REFERENCES public.kanban_lanes(id) ON DELETE SET NULL,
  target_kanban_column_id uuid REFERENCES public.kanban_columns(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT tag_automations_event_chk CHECK (event_type IN ('tag_applied')),
  CONSTRAINT tag_automations_entity_chk CHECK (entity_type IN ('ticket')),
  CONSTRAINT tag_automations_action_chk CHECK (action_type IN ('move_kanban_card'))
);

CREATE INDEX IF NOT EXISTS idx_tag_automations_company ON public.tag_automations(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tag_automations_tag ON public.tag_automations(tag_id) WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tag_automations TO authenticated;
GRANT ALL ON public.tag_automations TO service_role;

ALTER TABLE public.tag_automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tag_automations_select" ON public.tag_automations FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND (public.is_master(auth.uid()) OR public.user_belongs_to_company(auth.uid(), company_id))
);

CREATE POLICY "tag_automations_manage" ON public.tag_automations FOR ALL TO authenticated
USING (public._tags_can_manage(auth.uid(), company_id))
WITH CHECK (public._tags_can_manage(auth.uid(), company_id));

CREATE TRIGGER trg_tag_automations_updated_at
  BEFORE UPDATE ON public.tag_automations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Validation trigger: tag/lane/column must belong to same company, target column required for move_kanban_card,
-- target column must belong to target lane, neither soft-deleted.
CREATE OR REPLACE FUNCTION public.tag_automations_validate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _c uuid;
  _lane_id uuid;
  _col_lane uuid;
  _col_company uuid;
  _lane_company uuid;
BEGIN
  -- tag pertence à empresa
  SELECT company_id INTO _c FROM public.tags WHERE id = NEW.tag_id AND deleted_at IS NULL;
  IF _c IS NULL OR _c <> NEW.company_id THEN
    RAISE EXCEPTION 'tag must belong to the same company';
  END IF;

  IF NEW.action_type = 'move_kanban_card' THEN
    IF NEW.target_kanban_column_id IS NULL THEN
      RAISE EXCEPTION 'target_kanban_column_id is required for move_kanban_card';
    END IF;
    SELECT lane_id, company_id INTO _col_lane, _col_company
      FROM public.kanban_columns WHERE id = NEW.target_kanban_column_id AND deleted_at IS NULL;
    IF _col_company IS NULL THEN
      RAISE EXCEPTION 'target column not found or archived';
    END IF;
    IF _col_company <> NEW.company_id THEN
      RAISE EXCEPTION 'target column belongs to another company';
    END IF;
    IF NEW.target_kanban_lane_id IS NULL THEN
      NEW.target_kanban_lane_id := _col_lane;
    ELSIF NEW.target_kanban_lane_id <> _col_lane THEN
      RAISE EXCEPTION 'target column does not belong to target lane';
    END IF;
    SELECT company_id INTO _lane_company FROM public.kanban_lanes
      WHERE id = NEW.target_kanban_lane_id AND deleted_at IS NULL;
    IF _lane_company IS NULL OR _lane_company <> NEW.company_id THEN
      RAISE EXCEPTION 'target lane not found or in another company';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_tag_automations_validate
  BEFORE INSERT OR UPDATE ON public.tag_automations
  FOR EACH ROW EXECUTE FUNCTION public.tag_automations_validate();

-- Audit trigger for tag_automations
CREATE OR REPLACE FUNCTION public.tag_automations_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _evt text;
BEGIN
  IF TG_OP = 'INSERT' THEN _evt := 'automation.created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN _evt := 'automation.deleted';
    ELSE _evt := 'automation.updated'; END IF;
  END IF;
  INSERT INTO public.audit_logs(company_id, event_type, changed_by, metadata)
  VALUES (COALESCE(NEW.company_id, OLD.company_id), _evt, auth.uid(),
    jsonb_build_object(
      'automation_id', COALESCE(NEW.id, OLD.id),
      'tag_id', COALESCE(NEW.tag_id, OLD.tag_id),
      'event_type', COALESCE(NEW.event_type, OLD.event_type),
      'action_type', COALESCE(NEW.action_type, OLD.action_type),
      'target_kanban_column_id', COALESCE(NEW.target_kanban_column_id, OLD.target_kanban_column_id),
      'is_active', COALESCE(NEW.is_active, OLD.is_active),
      'source','tag_automations'));
  RETURN NEW;
END $$;

CREATE TRIGGER trg_tag_automations_audit
  AFTER INSERT OR UPDATE ON public.tag_automations
  FOR EACH ROW EXECUTE FUNCTION public.tag_automations_audit();

-- 2) tag_automation_jobs
CREATE TABLE IF NOT EXISTS public.tag_automation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES public.tag_automations(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  entity_type text NOT NULL DEFAULT 'ticket',
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  run_after timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tag_automation_jobs_status_chk CHECK (status IN ('pending','processing','done','failed','skipped'))
);

CREATE INDEX IF NOT EXISTS idx_tag_automation_jobs_pending
  ON public.tag_automation_jobs(status, run_after) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_tag_automation_jobs_automation ON public.tag_automation_jobs(automation_id);
CREATE INDEX IF NOT EXISTS idx_tag_automation_jobs_ticket ON public.tag_automation_jobs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_tag_automation_jobs_company ON public.tag_automation_jobs(company_id);

-- prevent duplicates while pending/processing
CREATE UNIQUE INDEX IF NOT EXISTS uq_tag_automation_jobs_active
  ON public.tag_automation_jobs(automation_id, ticket_id)
  WHERE status IN ('pending','processing') AND ticket_id IS NOT NULL;

GRANT SELECT ON public.tag_automation_jobs TO authenticated;
GRANT ALL ON public.tag_automation_jobs TO service_role;

ALTER TABLE public.tag_automation_jobs ENABLE ROW LEVEL SECURITY;

-- Only managers+ can read jobs; user role authentication via _tags_can_manage; service_role bypasses
CREATE POLICY "tag_automation_jobs_select" ON public.tag_automation_jobs FOR SELECT TO authenticated
USING (public._tags_can_manage(auth.uid(), company_id));

CREATE TRIGGER trg_tag_automation_jobs_updated_at
  BEFORE UPDATE ON public.tag_automation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Enqueue trigger on tag_links (after apply: insert OR un-archive of ticket entity)
CREATE OR REPLACE FUNCTION public.tag_links_enqueue_automations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _aut record;
  _job_id uuid;
  _activated boolean := false;
BEGIN
  -- only ticket entity in this version
  IF NEW.entity_type <> 'ticket' OR NEW.ticket_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
    _activated := true;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      _activated := true;
    END IF;
  END IF;

  IF NOT _activated THEN RETURN NEW; END IF;

  FOR _aut IN
    SELECT id FROM public.tag_automations
     WHERE company_id = NEW.company_id
       AND tag_id = NEW.tag_id
       AND is_active = true
       AND deleted_at IS NULL
       AND event_type = 'tag_applied'
       AND entity_type = 'ticket'
       AND action_type = 'move_kanban_card'
  LOOP
    BEGIN
      INSERT INTO public.tag_automation_jobs(
        company_id, automation_id, tag_id, entity_type, ticket_id, created_by
      ) VALUES (
        NEW.company_id, _aut.id, NEW.tag_id, 'ticket', NEW.ticket_id, NEW.created_by
      ) RETURNING id INTO _job_id;

      INSERT INTO public.audit_logs(company_id, event_type, ticket_id, changed_by, metadata)
      VALUES (NEW.company_id, 'automation.job_created', NEW.ticket_id, NEW.created_by,
        jsonb_build_object(
          'automation_id', _aut.id, 'job_id', _job_id,
          'tag_id', NEW.tag_id, 'entity_type','ticket',
          'ticket_id', NEW.ticket_id, 'source','tag_applied'));
    EXCEPTION WHEN unique_violation THEN
      -- already pending/processing for this ticket+automation; skip silently
      NULL;
    END;
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_tag_links_enqueue_automations
  AFTER INSERT OR UPDATE ON public.tag_links
  FOR EACH ROW EXECUTE FUNCTION public.tag_links_enqueue_automations();

-- 4) Worker RPC — service_role only
CREATE OR REPLACE FUNCTION public.process_tag_automation_jobs(_limit int DEFAULT 25, _worker text DEFAULT 'edge')
RETURNS TABLE(processed int, done int, skipped int, failed int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _job public.tag_automation_jobs%ROWTYPE;
  _aut public.tag_automations%ROWTYPE;
  _card public.kanban_cards%ROWTYPE;
  _col public.kanban_columns%ROWTYPE;
  _new_pos int;
  _old_lane uuid; _old_col uuid;
  _processed int := 0; _done int := 0; _skipped int := 0; _failed int := 0;
  _job_ids uuid[];
BEGIN
  -- Lock a batch of pending jobs
  WITH picked AS (
    SELECT id FROM public.tag_automation_jobs
     WHERE status = 'pending' AND run_after <= now()
     ORDER BY created_at ASC
     LIMIT GREATEST(_limit, 1)
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.tag_automation_jobs j
     SET status='processing', locked_at=now(), locked_by=_worker,
         started_at=now(), attempts=attempts+1, updated_at=now()
    FROM picked
   WHERE j.id = picked.id
  RETURNING j.id INTO _job_ids;

  IF _job_ids IS NULL THEN
    processed:=0; done:=0; skipped:=0; failed:=0; RETURN NEXT; RETURN;
  END IF;

  FOR _job IN SELECT * FROM public.tag_automation_jobs WHERE id = ANY(_job_ids)
  LOOP
    _processed := _processed + 1;
    BEGIN
      SELECT * INTO _aut FROM public.tag_automations
        WHERE id = _job.automation_id AND deleted_at IS NULL AND is_active = true;
      IF NOT FOUND THEN
        UPDATE public.tag_automation_jobs SET status='skipped', finished_at=now(),
          error_message='Automation inactive or removed', updated_at=now() WHERE id=_job.id;
        INSERT INTO public.audit_logs(company_id,event_type,ticket_id,changed_by,metadata)
        VALUES (_job.company_id,'automation.skipped',_job.ticket_id,NULL,
          jsonb_build_object('automation_id',_job.automation_id,'job_id',_job.id,
            'reason','inactive','source','tag_applied'));
        _skipped := _skipped + 1; CONTINUE;
      END IF;

      IF _aut.action_type <> 'move_kanban_card' THEN
        UPDATE public.tag_automation_jobs SET status='skipped', finished_at=now(),
          error_message='Action not supported', updated_at=now() WHERE id=_job.id;
        _skipped := _skipped + 1; CONTINUE;
      END IF;

      -- Find active ticket card
      SELECT * INTO _card FROM public.kanban_cards
        WHERE company_id = _job.company_id
          AND card_type = 'ticket'
          AND ticket_id = _job.ticket_id
          AND deleted_at IS NULL
        ORDER BY updated_at DESC LIMIT 1;
      IF NOT FOUND THEN
        UPDATE public.tag_automation_jobs SET status='skipped', finished_at=now(),
          error_message='Nenhum card Kanban ativo encontrado para este ticket.', updated_at=now()
          WHERE id=_job.id;
        INSERT INTO public.audit_logs(company_id,event_type,ticket_id,changed_by,metadata)
        VALUES (_job.company_id,'automation.skipped',_job.ticket_id,NULL,
          jsonb_build_object('automation_id',_aut.id,'job_id',_job.id,
            'reason','no_kanban_card','source','tag_applied'));
        _skipped := _skipped + 1; CONTINUE;
      END IF;

      -- Validate target column
      SELECT * INTO _col FROM public.kanban_columns
        WHERE id = _aut.target_kanban_column_id AND deleted_at IS NULL
          AND company_id = _job.company_id;
      IF NOT FOUND THEN
        UPDATE public.tag_automation_jobs SET status='failed', finished_at=now(),
          error_message='Coluna alvo inválida ou arquivada.', updated_at=now() WHERE id=_job.id;
        INSERT INTO public.audit_logs(company_id,event_type,ticket_id,changed_by,metadata)
        VALUES (_job.company_id,'automation.failed',_job.ticket_id,NULL,
          jsonb_build_object('automation_id',_aut.id,'job_id',_job.id,
            'reason','invalid_target_column','source','tag_applied'));
        _failed := _failed + 1; CONTINUE;
      END IF;

      _old_lane := _card.lane_id; _old_col := _card.column_id;

      -- No-op if already in target column
      IF _card.column_id = _col.id AND _card.lane_id = _col.lane_id THEN
        UPDATE public.tag_automation_jobs SET status='done', finished_at=now(),
          error_message=NULL, updated_at=now() WHERE id=_job.id;
        INSERT INTO public.audit_logs(company_id,event_type,ticket_id,changed_by,metadata)
        VALUES (_job.company_id,'automation.executed',_job.ticket_id,NULL,
          jsonb_build_object('automation_id',_aut.id,'job_id',_job.id,
            'card_id',_card.id,'from_column_id',_old_col,'to_column_id',_col.id,
            'noop',true,'source','tag_applied'));
        _done := _done + 1; CONTINUE;
      END IF;

      SELECT COALESCE(MAX(position),0)+1 INTO _new_pos FROM public.kanban_cards
        WHERE column_id = _col.id AND deleted_at IS NULL;

      UPDATE public.kanban_cards
         SET lane_id = _col.lane_id, column_id = _col.id, position = _new_pos, updated_at=now()
       WHERE id = _card.id;

      UPDATE public.tag_automation_jobs SET status='done', finished_at=now(),
        error_message=NULL, updated_at=now() WHERE id=_job.id;
      INSERT INTO public.audit_logs(company_id,event_type,ticket_id,changed_by,metadata)
      VALUES (_job.company_id,'automation.executed',_job.ticket_id,NULL,
        jsonb_build_object('automation_id',_aut.id,'job_id',_job.id,
          'card_id',_card.id,'from_lane_id',_old_lane,'from_column_id',_old_col,
          'to_lane_id',_col.lane_id,'to_column_id',_col.id,
          'source','tag_applied'));
      _done := _done + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.tag_automation_jobs
         SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
             error_message = SQLERRM,
             run_after = now() + interval '1 minute',
             locked_at = NULL, locked_by = NULL, finished_at = CASE WHEN attempts >= max_attempts THEN now() ELSE NULL END,
             updated_at = now()
       WHERE id = _job.id;
      INSERT INTO public.audit_logs(company_id,event_type,ticket_id,changed_by,metadata)
      VALUES (_job.company_id,'automation.failed',_job.ticket_id,NULL,
        jsonb_build_object('automation_id',_job.automation_id,'job_id',_job.id,
          'reason','exception','source','tag_applied'));
      _failed := _failed + 1;
    END;
  END LOOP;

  processed:=_processed; done:=_done; skipped:=_skipped; failed:=_failed;
  RETURN NEXT;
END $$;

REVOKE ALL ON FUNCTION public.process_tag_automation_jobs(int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_tag_automation_jobs(int, text) TO service_role;
