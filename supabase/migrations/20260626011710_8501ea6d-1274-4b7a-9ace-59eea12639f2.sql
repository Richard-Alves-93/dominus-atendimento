
-- K.7 commercial action fields on kanban_columns
ALTER TABLE public.kanban_columns
  ADD COLUMN IF NOT EXISTS commercial_action_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS commercial_action text;

-- Validation trigger: only commercial lanes may have commercial actions
CREATE OR REPLACE FUNCTION public.kanban_columns_validate_commercial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _lane_type text;
BEGIN
  SELECT lane_type INTO _lane_type FROM public.kanban_lanes WHERE id = NEW.lane_id;

  IF _lane_type IS DISTINCT FROM 'commercial' THEN
    NEW.commercial_action_enabled := false;
    NEW.commercial_action := NULL;
    RETURN NEW;
  END IF;

  IF NEW.commercial_action_enabled = true THEN
    IF NEW.commercial_action IS NULL
       OR NEW.commercial_action NOT IN ('mark_open','mark_won','mark_lost','mark_canceled') THEN
      RAISE EXCEPTION 'commercial_action must be one of mark_open, mark_won, mark_lost, mark_canceled when enabled';
    END IF;
  ELSE
    -- when not enabled, clear stale action
    IF NEW.commercial_action IS NOT NULL AND NEW.commercial_action NOT IN ('none','mark_open','mark_won','mark_lost','mark_canceled') THEN
      NEW.commercial_action := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kanban_columns_validate_commercial_trg ON public.kanban_columns;
CREATE TRIGGER kanban_columns_validate_commercial_trg
  BEFORE INSERT OR UPDATE ON public.kanban_columns
  FOR EACH ROW EXECUTE FUNCTION public.kanban_columns_validate_commercial();

-- RPC: update opportunity status from kanban movement
CREATE OR REPLACE FUNCTION public.update_opportunity_status_from_kanban(
  _company_id uuid,
  _opportunity_id uuid,
  _kanban_card_id uuid,
  _kanban_lane_id uuid,
  _kanban_column_id uuid
) RETURNS TABLE(opportunity_id uuid, old_status text, new_status text, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_master boolean;
  _opp public.opportunities%ROWTYPE;
  _card public.kanban_cards%ROWTYPE;
  _lane public.kanban_lanes%ROWTYPE;
  _col public.kanban_columns%ROWTYPE;
  _new_status text;
  _contact_id uuid;
  _ticket_id uuid;
  _msg text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  SELECT (COALESCE(is_master,false) OR COALESCE(global_role='master',false))
    INTO _is_master FROM public.profiles WHERE id = _uid;

  IF NOT (_is_master OR public.user_belongs_to_company(_uid, _company_id)) THEN
    RAISE EXCEPTION 'forbidden_company';
  END IF;

  SELECT * INTO _opp FROM public.opportunities WHERE id = _opportunity_id;
  IF NOT FOUND OR _opp.company_id <> _company_id OR _opp.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'opportunity_not_found';
  END IF;

  SELECT * INTO _card FROM public.kanban_cards WHERE id = _kanban_card_id;
  IF NOT FOUND
     OR _card.company_id <> _company_id
     OR _card.card_type <> 'opportunity'
     OR _card.opportunity_id IS NULL
     OR _card.opportunity_id <> _opportunity_id THEN
    RAISE EXCEPTION 'card_invalid';
  END IF;

  SELECT * INTO _lane FROM public.kanban_lanes WHERE id = _kanban_lane_id;
  IF NOT FOUND OR _lane.company_id <> _company_id OR _lane.lane_type <> 'commercial' THEN
    RAISE EXCEPTION 'lane_not_commercial';
  END IF;

  SELECT * INTO _col FROM public.kanban_columns WHERE id = _kanban_column_id;
  IF NOT FOUND
     OR _col.company_id <> _company_id
     OR _col.lane_id <> _kanban_lane_id
     OR COALESCE(_col.commercial_action_enabled,false) = false THEN
    RAISE EXCEPTION 'column_not_commercial';
  END IF;

  _new_status := CASE _col.commercial_action
    WHEN 'mark_open' THEN 'open'
    WHEN 'mark_won' THEN 'won'
    WHEN 'mark_lost' THEN 'lost'
    WHEN 'mark_canceled' THEN 'canceled'
    ELSE NULL
  END;

  IF _new_status IS NULL THEN
    RAISE EXCEPTION 'commercial_action_invalid';
  END IF;

  -- no-op
  IF _opp.status = _new_status THEN
    RETURN QUERY SELECT _opp.id, _opp.status, _opp.status, 'noop'::text;
    RETURN;
  END IF;

  UPDATE public.opportunities
    SET status = _new_status,
        updated_at = now()
    WHERE id = _opp.id;

  INSERT INTO public.audit_logs (company_id, event_type, ticket_id, changed_by, metadata)
  VALUES (_company_id, 'opportunity.status_changed_by_kanban', _opp.ticket_id, _uid,
    jsonb_build_object(
      'opportunity_id', _opp.id,
      'old_status', _opp.status,
      'new_status', _new_status,
      'kanban_card_id', _kanban_card_id,
      'kanban_lane_id', _kanban_lane_id,
      'kanban_column_id', _kanban_column_id,
      'source', 'kanban_commercial_action'
    ));

  -- internal system message in ticket if any
  IF _opp.ticket_id IS NOT NULL THEN
    _ticket_id := _opp.ticket_id;
    SELECT contact_id INTO _contact_id FROM public.tickets WHERE id = _ticket_id;
    _msg := CASE _new_status
      WHEN 'open' THEN 'Oportunidade marcada como Aberta pelo Kanban.'
      WHEN 'won' THEN 'Oportunidade marcada como Ganha pelo Kanban.'
      WHEN 'lost' THEN 'Oportunidade marcada como Perdida pelo Kanban.'
      WHEN 'canceled' THEN 'Oportunidade marcada como Cancelada pelo Kanban.'
    END;
    IF _contact_id IS NOT NULL THEN
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
  END IF;

  RETURN QUERY SELECT _opp.id, _opp.status, _new_status, 'updated'::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_opportunity_status_from_kanban(uuid,uuid,uuid,uuid,uuid) TO authenticated;
