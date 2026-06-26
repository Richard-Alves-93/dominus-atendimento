
CREATE OR REPLACE FUNCTION public.create_opportunity_from_kanban(
  _company_id uuid,
  _kanban_card_id uuid,
  _title text,
  _amount numeric,
  _assigned_user_id uuid,
  _status text,
  _notes text,
  _target_lane_id uuid,
  _target_column_id uuid
)
RETURNS TABLE(opportunity_id uuid, new_card_id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_master boolean;
  _role company_user_role;
  _card public.kanban_cards%ROWTYPE;
  _ticket public.tickets%ROWTYPE;
  _contact public.contacts%ROWTYPE;
  _target_lane public.kanban_lanes%ROWTYPE;
  _target_col public.kanban_columns%ROWTYPE;
  _assignee uuid;
  _ticket_id uuid;
  _contact_id uuid;
  _department_id uuid;
  _new_opp_id uuid;
  _new_card_id uuid;
  _final_title text;
  _final_status text;
  _amount_norm numeric;
  _msg text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  SELECT (COALESCE(is_master,false) OR COALESCE(global_role='master',false))
    INTO _is_master FROM public.profiles WHERE id = _uid;

  IF NOT (_is_master OR public.user_belongs_to_company(_uid, _company_id)) THEN
    RAISE EXCEPTION 'forbidden_company';
  END IF;

  -- role check (any active member can create; agent allowed)
  IF NOT _is_master THEN
    SELECT role INTO _role FROM public.company_users
      WHERE user_id = _uid AND company_id = _company_id AND status = 'active';
    IF _role IS NULL THEN
      RAISE EXCEPTION 'forbidden_role';
    END IF;
  END IF;

  -- validate card
  SELECT * INTO _card FROM public.kanban_cards
    WHERE id = _kanban_card_id AND company_id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'card_not_found'; END IF;
  IF _card.card_type NOT IN ('contact','ticket') THEN
    RAISE EXCEPTION 'invalid_card_type';
  END IF;

  -- resolve sources from card
  IF _card.card_type = 'ticket' THEN
    IF _card.ticket_id IS NULL THEN RAISE EXCEPTION 'card_ticket_missing'; END IF;
    SELECT * INTO _ticket FROM public.tickets WHERE id = _card.ticket_id;
    IF NOT FOUND OR _ticket.company_id <> _company_id THEN
      RAISE EXCEPTION 'ticket_invalid';
    END IF;
    _ticket_id := _ticket.id;
    _contact_id := _ticket.contact_id;
    _department_id := _ticket.department_id;
    _assignee := COALESCE(_assigned_user_id, _ticket.assigned_user_id, _uid);
  ELSE
    IF _card.contact_id IS NULL THEN RAISE EXCEPTION 'card_contact_missing'; END IF;
    SELECT * INTO _contact FROM public.contacts WHERE id = _card.contact_id;
    IF NOT FOUND OR _contact.company_id <> _company_id THEN
      RAISE EXCEPTION 'contact_invalid';
    END IF;
    _contact_id := _contact.id;
    _ticket_id := NULL;
    _department_id := NULL;
    _assignee := COALESCE(_assigned_user_id, _uid);
  END IF;

  -- validate assignee belongs to company
  IF _assignee IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.company_users
      WHERE user_id = _assignee AND company_id = _company_id AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'assignee_not_in_company';
    END IF;
  END IF;

  -- status
  _final_status := COALESCE(NULLIF(_status,''), 'open');
  IF _final_status NOT IN ('open','won','lost','canceled') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  -- title
  _final_title := COALESCE(NULLIF(btrim(_title),''), _card.title, 'Nova oportunidade');

  -- amount
  _amount_norm := CASE WHEN _amount IS NULL OR _amount <= 0 THEN NULL ELSE _amount END;

  -- duplicate check (block by open ticket)
  IF _ticket_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.opportunities
      WHERE company_id = _company_id
        AND ticket_id = _ticket_id
        AND status = 'open'
        AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'duplicate_open_opportunity_for_ticket';
    END IF;
  END IF;

  -- validate target lane/column if provided
  IF _target_lane_id IS NOT NULL THEN
    SELECT * INTO _target_lane FROM public.kanban_lanes WHERE id = _target_lane_id;
    IF NOT FOUND OR _target_lane.company_id <> _company_id THEN
      RAISE EXCEPTION 'target_lane_invalid';
    END IF;
    IF _target_column_id IS NULL THEN
      RAISE EXCEPTION 'target_column_required';
    END IF;
    SELECT * INTO _target_col FROM public.kanban_columns WHERE id = _target_column_id;
    IF NOT FOUND
       OR _target_col.company_id <> _company_id
       OR _target_col.lane_id <> _target_lane_id THEN
      RAISE EXCEPTION 'target_column_invalid';
    END IF;
  ELSIF _target_column_id IS NOT NULL THEN
    RAISE EXCEPTION 'target_lane_required';
  END IF;

  -- create opportunity
  INSERT INTO public.opportunities (
    company_id, ticket_id, contact_id, department_id,
    assigned_user_id, created_by, title, status, amount, currency, source, notes
  ) VALUES (
    _company_id, _ticket_id, _contact_id, _department_id,
    _assignee, _uid, _final_title, _final_status, _amount_norm, 'BRL',
    'kanban', NULLIF(btrim(_notes),'')
  ) RETURNING id INTO _new_opp_id;

  -- optionally create kanban card
  IF _target_lane_id IS NOT NULL AND _target_column_id IS NOT NULL THEN
    INSERT INTO public.kanban_cards (
      company_id, lane_id, column_id, title, description,
      card_type, opportunity_id, contact_id, ticket_id,
      assigned_user_id, created_by, position
    ) VALUES (
      _company_id, _target_lane_id, _target_column_id, _final_title,
      NULLIF(btrim(_notes),''),
      'opportunity', _new_opp_id, _contact_id, _ticket_id,
      _assignee, _uid,
      COALESCE((SELECT max(position)+1 FROM public.kanban_cards
                WHERE column_id = _target_column_id AND deleted_at IS NULL), 0)
    ) RETURNING id INTO _new_card_id;
  END IF;

  -- audit log
  INSERT INTO public.audit_logs (company_id, event_type, ticket_id, changed_by, metadata)
  VALUES (_company_id, 'opportunity.created_from_kanban', _ticket_id, _uid,
    jsonb_build_object(
      'opportunity_id', _new_opp_id,
      'kanban_card_id', _kanban_card_id,
      'source_card_type', _card.card_type,
      'ticket_id', _ticket_id,
      'contact_id', _contact_id,
      'assigned_user_id', _assignee,
      'amount', _amount_norm,
      'status', _final_status,
      'target_lane_id', _target_lane_id,
      'target_column_id', _target_column_id,
      'new_card_id', _new_card_id,
      'source', 'kanban'
    ));

  -- internal system message in ticket
  IF _ticket_id IS NOT NULL AND _contact_id IS NOT NULL THEN
    _msg := CASE
      WHEN _amount_norm IS NOT NULL THEN
        'Oportunidade criada pelo Kanban no valor de R$ ' || to_char(_amount_norm, 'FM999G999G990D00') || '.'
      ELSE
        'Oportunidade criada pelo Kanban.'
    END;
    BEGIN
      INSERT INTO public.messages (
        company_id, ticket_id, contact_id, channel_id,
        direction, from_me, msg_type, source, body, delivery_status
      ) VALUES (
        _company_id, _ticket_id, _contact_id, NULL,
        'inbound', false, 'system', 'system', _msg, 'sent'
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN QUERY SELECT _new_opp_id, _new_card_id, 'created'::text;
END;
$$;
