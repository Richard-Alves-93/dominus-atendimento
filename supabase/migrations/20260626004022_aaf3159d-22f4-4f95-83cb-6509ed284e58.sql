
-- 1) ticket_transfers table
CREATE TABLE IF NOT EXISTS public.ticket_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  from_department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  to_department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE SET NULL,
  from_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  transferred_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'kanban',
  kanban_card_id uuid REFERENCES public.kanban_cards(id) ON DELETE SET NULL,
  kanban_lane_id uuid REFERENCES public.kanban_lanes(id) ON DELETE SET NULL,
  kanban_column_id uuid REFERENCES public.kanban_columns(id) ON DELETE SET NULL,
  return_if_unassigned boolean NOT NULL DEFAULT false,
  return_timeout_minutes integer,
  return_target text,
  return_deadline_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  returned_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_transfers_company_idx ON public.ticket_transfers(company_id);
CREATE INDEX IF NOT EXISTS ticket_transfers_ticket_idx ON public.ticket_transfers(ticket_id);
CREATE INDEX IF NOT EXISTS ticket_transfers_status_idx ON public.ticket_transfers(company_id, status);

GRANT SELECT ON public.ticket_transfers TO authenticated;
GRANT ALL ON public.ticket_transfers TO service_role;

ALTER TABLE public.ticket_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY ticket_transfers_select ON public.ticket_transfers
  FOR SELECT TO authenticated
  USING (public.is_master(auth.uid()) OR public.user_belongs_to_company(auth.uid(), company_id));

-- INSERT/UPDATE only via SECURITY DEFINER RPC (service_role)

CREATE TRIGGER trg_ticket_transfers_updated_at
  BEFORE UPDATE ON public.ticket_transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) RPC
CREATE OR REPLACE FUNCTION public.transfer_ticket_to_department_from_kanban(
  _company_id uuid,
  _ticket_id uuid,
  _target_department_id uuid,
  _kanban_card_id uuid,
  _kanban_lane_id uuid,
  _kanban_column_id uuid
) RETURNS TABLE(transfer_id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _role company_user_role;
  _is_master boolean;
  _ticket public.tickets%ROWTYPE;
  _lane public.kanban_lanes%ROWTYPE;
  _card public.kanban_cards%ROWTYPE;
  _target_dept public.departments%ROWTYPE;
  _from_dept_id uuid;
  _from_user_id uuid;
  _from_dept_name text;
  _to_dept_name text;
  _from_user_name text;
  _allowed boolean := false;
  _is_member_source boolean := false;
  _transfer_id uuid;
  _deadline timestamptz;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  SELECT (COALESCE(is_master,false) OR COALESCE(global_role='master',false))
    INTO _is_master FROM public.profiles WHERE id = _uid;

  -- company membership
  IF NOT (_is_master OR public.user_belongs_to_company(_uid, _company_id)) THEN
    RAISE EXCEPTION 'forbidden_company';
  END IF;

  -- ticket
  SELECT * INTO _ticket FROM public.tickets WHERE id = _ticket_id;
  IF NOT FOUND OR _ticket.company_id <> _company_id THEN
    RAISE EXCEPTION 'ticket_not_found';
  END IF;
  IF _ticket.status = 'closed' THEN
    RAISE EXCEPTION 'ticket_closed';
  END IF;

  -- target department
  SELECT * INTO _target_dept FROM public.departments
    WHERE id = _target_department_id AND company_id = _company_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'department_not_found'; END IF;

  -- lane
  SELECT * INTO _lane FROM public.kanban_lanes WHERE id = _kanban_lane_id;
  IF NOT FOUND
     OR _lane.company_id <> _company_id
     OR _lane.lane_type <> 'department'
     OR COALESCE(_lane.operational_enabled,false) = false
     OR COALESCE(_lane.transfer_ticket_on_drop,false) = false
     OR _lane.department_id IS NULL
     OR _lane.department_id <> _target_department_id THEN
    RAISE EXCEPTION 'lane_not_operational';
  END IF;

  -- card
  SELECT * INTO _card FROM public.kanban_cards WHERE id = _kanban_card_id;
  IF NOT FOUND
     OR _card.company_id <> _company_id
     OR _card.card_type <> 'ticket'
     OR _card.ticket_id IS NULL
     OR _card.ticket_id <> _ticket_id THEN
    RAISE EXCEPTION 'card_invalid';
  END IF;

  -- permission
  IF _is_master THEN
    _allowed := true;
  ELSE
    SELECT role INTO _role FROM public.company_users
     WHERE user_id = _uid AND company_id = _company_id AND status = 'active';
    IF _role IN ('owner','admin','manager') THEN
      _allowed := true;
    ELSIF _role = 'agent' THEN
      IF _ticket.assigned_user_id = _uid THEN
        _allowed := true;
      ELSIF _ticket.department_id IS NOT NULL THEN
        SELECT EXISTS(
          SELECT 1 FROM public.department_users
           WHERE company_id = _company_id
             AND department_id = _ticket.department_id
             AND user_id = _uid
             AND status = 'active'
        ) INTO _is_member_source;
        _allowed := _is_member_source;
      END IF;
    END IF;
  END IF;

  IF NOT _allowed THEN RAISE EXCEPTION 'forbidden_role'; END IF;

  _from_dept_id := _ticket.department_id;
  _from_user_id := _ticket.assigned_user_id;

  -- no-op if same department and no assignee change needed
  IF _from_dept_id IS NOT DISTINCT FROM _target_department_id
     AND _from_user_id IS NULL THEN
    -- still ok: nothing to change; skip
    RETURN QUERY SELECT NULL::uuid, 'noop'::text;
    RETURN;
  END IF;

  -- update ticket
  UPDATE public.tickets
     SET department_id = _target_department_id,
         assigned_user_id = NULL,
         assigned_at = NULL,
         assigned_by = NULL,
         status = CASE WHEN status = 'closed' THEN 'open' ELSE status END,
         updated_at = now()
   WHERE id = _ticket_id;

  -- compute deadline if lane configured return
  IF COALESCE(_lane.return_if_unassigned,false) = true
     AND _lane.return_timeout_minutes IS NOT NULL
     AND _lane.return_timeout_minutes > 0 THEN
    _deadline := now() + make_interval(mins => _lane.return_timeout_minutes);
  END IF;

  INSERT INTO public.ticket_transfers (
    company_id, ticket_id, from_department_id, to_department_id,
    from_user_id, transferred_by, source,
    kanban_card_id, kanban_lane_id, kanban_column_id,
    return_if_unassigned, return_timeout_minutes, return_target, return_deadline_at,
    status
  ) VALUES (
    _company_id, _ticket_id, _from_dept_id, _target_department_id,
    _from_user_id, _uid, 'kanban',
    _kanban_card_id, _kanban_lane_id, _kanban_column_id,
    COALESCE(_lane.return_if_unassigned,false),
    _lane.return_timeout_minutes,
    _lane.return_target,
    _deadline,
    'pending'
  ) RETURNING id INTO _transfer_id;

  -- audit
  INSERT INTO public.audit_logs (company_id, event_type, ticket_id, changed_by, metadata)
  VALUES (_company_id, 'ticket.transferred_by_kanban', _ticket_id, _uid,
    jsonb_build_object(
      'ticket_id', _ticket_id,
      'from_department_id', _from_dept_id,
      'to_department_id', _target_department_id,
      'from_user_id', _from_user_id,
      'transferred_by', _uid,
      'kanban_card_id', _kanban_card_id,
      'kanban_lane_id', _kanban_lane_id,
      'kanban_column_id', _kanban_column_id,
      'transfer_id', _transfer_id,
      'source', 'kanban'
    ));

  -- internal system message
  SELECT name INTO _to_dept_name FROM public.departments WHERE id = _target_department_id;
  IF _from_dept_id IS NOT NULL THEN
    SELECT name INTO _from_dept_name FROM public.departments WHERE id = _from_dept_id;
  END IF;
  IF _from_user_id IS NOT NULL THEN
    SELECT full_name INTO _from_user_name FROM public.profiles WHERE id = _from_user_id;
  END IF;

  BEGIN
    INSERT INTO public.messages (
      company_id, ticket_id, contact_id, channel_id,
      direction, from_me, msg_type, source, body, delivery_status
    ) VALUES (
      _company_id, _ticket_id, _ticket.contact_id, NULL,
      'inbound', false, 'system', 'system',
      CASE
        WHEN _from_user_name IS NOT NULL THEN
          'Atendimento transferido de ' || _from_user_name ||
          ' para o setor ' || COALESCE(_to_dept_name,'destino') || ' pelo Kanban.'
        ELSE
          'Atendimento transferido para o setor ' || COALESCE(_to_dept_name,'destino') || ' pelo Kanban.'
      END,
      'sent'
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN QUERY SELECT _transfer_id, 'transferred'::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.transfer_ticket_to_department_from_kanban(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_ticket_to_department_from_kanban(uuid,uuid,uuid,uuid,uuid,uuid) TO authenticated;
