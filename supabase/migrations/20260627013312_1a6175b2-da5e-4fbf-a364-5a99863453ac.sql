
-- K.10: Reorder + edit (manual cards) + archive RPCs for Kanban

-- helpers visibility
CREATE OR REPLACE FUNCTION public._k10_can_manage_company(_uid uuid, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.is_master(_uid), false)
    OR EXISTS (
      SELECT 1 FROM public.company_users
      WHERE user_id = _uid AND company_id = _company_id AND status='active'
        AND role IN ('owner','admin','manager')
    );
$$;

CREATE OR REPLACE FUNCTION public._k10_check_lane_access(_uid uuid, _company_id uuid, _lane public.kanban_lanes)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _is_master boolean; _can_manage boolean;
BEGIN
  IF _lane.company_id <> _company_id THEN RAISE EXCEPTION 'forbidden_company'; END IF;
  SELECT COALESCE(is_master,false) OR COALESCE(global_role='master',false) INTO _is_master FROM public.profiles WHERE id=_uid;
  IF _is_master THEN RETURN; END IF;
  IF NOT public.user_belongs_to_company(_uid, _company_id) THEN RAISE EXCEPTION 'forbidden_company'; END IF;
  SELECT public._k10_can_manage_company(_uid, _company_id) INTO _can_manage;
  IF _lane.is_personal THEN
    IF _lane.owner_user_id IS DISTINCT FROM _uid THEN RAISE EXCEPTION 'forbidden_personal_lane'; END IF;
  ELSE
    IF NOT _can_manage THEN RAISE EXCEPTION 'forbidden_role'; END IF;
  END IF;
END $$;

-- Reorder lane up/down
CREATE OR REPLACE FUNCTION public.reorder_kanban_lane(_company_id uuid, _lane_id uuid, _direction text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _lane public.kanban_lanes%ROWTYPE;
  _other public.kanban_lanes%ROWTYPE;
  _is_master boolean;
  _can_manage boolean;
  _old_pos int; _new_pos int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF _direction NOT IN ('up','down') THEN RAISE EXCEPTION 'invalid_direction'; END IF;
  SELECT * INTO _lane FROM public.kanban_lanes WHERE id=_lane_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lane_not_found'; END IF;
  PERFORM public._k10_check_lane_access(_uid, _company_id, _lane);
  SELECT COALESCE(is_master,false) OR COALESCE(global_role='master',false) INTO _is_master FROM public.profiles WHERE id=_uid;
  _can_manage := _is_master OR public._k10_can_manage_company(_uid, _company_id);

  -- Scope swap: personal lanes only swap within same owner's personal lanes; otherwise company-level
  IF _lane.is_personal THEN
    SELECT * INTO _other FROM public.kanban_lanes
     WHERE company_id=_company_id AND deleted_at IS NULL AND is_personal=true AND owner_user_id=_uid
       AND id <> _lane.id
       AND (( _direction='up' AND position < _lane.position) OR (_direction='down' AND position > _lane.position))
     ORDER BY CASE WHEN _direction='up' THEN position END DESC,
              CASE WHEN _direction='down' THEN position END ASC
     LIMIT 1 FOR UPDATE;
  ELSE
    SELECT * INTO _other FROM public.kanban_lanes
     WHERE company_id=_company_id AND deleted_at IS NULL AND is_personal=false
       AND id <> _lane.id
       AND (( _direction='up' AND position < _lane.position) OR (_direction='down' AND position > _lane.position))
     ORDER BY CASE WHEN _direction='up' THEN position END DESC,
              CASE WHEN _direction='down' THEN position END ASC
     LIMIT 1 FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RETURN; END IF;

  _old_pos := _lane.position; _new_pos := _other.position;
  UPDATE public.kanban_lanes SET position=_new_pos, updated_at=now() WHERE id=_lane.id;
  UPDATE public.kanban_lanes SET position=_old_pos, updated_at=now() WHERE id=_other.id;

  INSERT INTO public.audit_logs(company_id,event_type,changed_by,metadata)
  VALUES (_company_id,'kanban.lane_reordered',_uid,
    jsonb_build_object('lane_id',_lane.id,'old_position',_old_pos,'new_position',_new_pos,
      'swapped_with_lane_id',_other.id,'direction',_direction,'source','kanban_organization'));
END $$;

-- Reorder column within same lane
CREATE OR REPLACE FUNCTION public.reorder_kanban_column(_company_id uuid, _column_id uuid, _direction text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _col public.kanban_columns%ROWTYPE;
  _other public.kanban_columns%ROWTYPE;
  _lane public.kanban_lanes%ROWTYPE;
  _old_pos int; _new_pos int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF _direction NOT IN ('left','right') THEN RAISE EXCEPTION 'invalid_direction'; END IF;
  SELECT * INTO _col FROM public.kanban_columns WHERE id=_column_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'column_not_found'; END IF;
  IF _col.company_id <> _company_id THEN RAISE EXCEPTION 'forbidden_company'; END IF;
  SELECT * INTO _lane FROM public.kanban_lanes WHERE id=_col.lane_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'lane_not_found'; END IF;
  PERFORM public._k10_check_lane_access(_uid, _company_id, _lane);

  SELECT * INTO _other FROM public.kanban_columns
   WHERE lane_id=_col.lane_id AND deleted_at IS NULL AND id <> _col.id
     AND (( _direction='left' AND position < _col.position) OR (_direction='right' AND position > _col.position))
   ORDER BY CASE WHEN _direction='left' THEN position END DESC,
            CASE WHEN _direction='right' THEN position END ASC
   LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  _old_pos := _col.position; _new_pos := _other.position;
  UPDATE public.kanban_columns SET position=_new_pos, updated_at=now() WHERE id=_col.id;
  UPDATE public.kanban_columns SET position=_old_pos, updated_at=now() WHERE id=_other.id;

  INSERT INTO public.audit_logs(company_id,event_type,changed_by,metadata)
  VALUES (_company_id,'kanban.column_reordered',_uid,
    jsonb_build_object('column_id',_col.id,'lane_id',_col.lane_id,'old_position',_old_pos,'new_position',_new_pos,
      'swapped_with_column_id',_other.id,'direction',_direction,'source','kanban_organization'));
END $$;

-- Reorder card within same column
CREATE OR REPLACE FUNCTION public.reorder_kanban_card(_company_id uuid, _card_id uuid, _direction text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _card public.kanban_cards%ROWTYPE;
  _other public.kanban_cards%ROWTYPE;
  _lane public.kanban_lanes%ROWTYPE;
  _old_pos int; _new_pos int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF _direction NOT IN ('up','down') THEN RAISE EXCEPTION 'invalid_direction'; END IF;
  SELECT * INTO _card FROM public.kanban_cards WHERE id=_card_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'card_not_found'; END IF;
  IF _card.company_id <> _company_id THEN RAISE EXCEPTION 'forbidden_company'; END IF;
  SELECT * INTO _lane FROM public.kanban_lanes WHERE id=_card.lane_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'lane_not_found'; END IF;
  PERFORM public._k10_check_lane_access(_uid, _company_id, _lane);

  SELECT * INTO _other FROM public.kanban_cards
   WHERE column_id=_card.column_id AND deleted_at IS NULL AND id <> _card.id
     AND (( _direction='up' AND position < _card.position) OR (_direction='down' AND position > _card.position))
   ORDER BY CASE WHEN _direction='up' THEN position END DESC,
            CASE WHEN _direction='down' THEN position END ASC
   LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  _old_pos := _card.position; _new_pos := _other.position;
  UPDATE public.kanban_cards SET position=_new_pos, updated_at=now() WHERE id=_card.id;
  UPDATE public.kanban_cards SET position=_old_pos, updated_at=now() WHERE id=_other.id;

  INSERT INTO public.audit_logs(company_id,event_type,changed_by,metadata)
  VALUES (_company_id,'kanban.card_reordered',_uid,
    jsonb_build_object('card_id',_card.id,'column_id',_card.column_id,'lane_id',_card.lane_id,
      'old_position',_old_pos,'new_position',_new_pos,'card_type',_card.card_type,
      'swapped_with_card_id',_other.id,'direction',_direction,'source','kanban_organization'));
END $$;

-- Edit manual card
CREATE OR REPLACE FUNCTION public.update_kanban_manual_card(
  _company_id uuid, _card_id uuid, _title text, _description text, _assigned_user_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _card public.kanban_cards%ROWTYPE;
  _lane public.kanban_lanes%ROWTYPE;
  _new_title text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT * INTO _card FROM public.kanban_cards WHERE id=_card_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'card_not_found'; END IF;
  IF _card.company_id <> _company_id THEN RAISE EXCEPTION 'forbidden_company'; END IF;
  IF _card.card_type <> 'manual' THEN RAISE EXCEPTION 'only_manual_cards_editable'; END IF;
  SELECT * INTO _lane FROM public.kanban_lanes WHERE id=_card.lane_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'lane_not_found'; END IF;
  PERFORM public._k10_check_lane_access(_uid, _company_id, _lane);

  _new_title := COALESCE(NULLIF(btrim(_title),''), _card.title);
  IF _assigned_user_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.company_users WHERE user_id=_assigned_user_id AND company_id=_company_id AND status='active') THEN
      RAISE EXCEPTION 'assignee_not_in_company';
    END IF;
  END IF;

  UPDATE public.kanban_cards
     SET title=_new_title,
         description=NULLIF(btrim(_description),''),
         assigned_user_id=_assigned_user_id,
         updated_at=now()
   WHERE id=_card.id;

  INSERT INTO public.audit_logs(company_id,event_type,changed_by,metadata)
  VALUES (_company_id,'kanban.card_updated',_uid,
    jsonb_build_object('card_id',_card.id,'lane_id',_card.lane_id,'column_id',_card.column_id,
      'card_type','manual','source','kanban_organization'));
END $$;

-- Archive card (soft delete)
CREATE OR REPLACE FUNCTION public.archive_kanban_card(_company_id uuid, _card_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_master boolean; _can_manage boolean;
  _card public.kanban_cards%ROWTYPE;
  _lane public.kanban_lanes%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT * INTO _card FROM public.kanban_cards WHERE id=_card_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'card_not_found'; END IF;
  IF _card.company_id <> _company_id THEN RAISE EXCEPTION 'forbidden_company'; END IF;
  SELECT * INTO _lane FROM public.kanban_lanes WHERE id=_card.lane_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'lane_not_found'; END IF;

  SELECT COALESCE(is_master,false) OR COALESCE(global_role='master',false) INTO _is_master FROM public.profiles WHERE id=_uid;
  _can_manage := _is_master OR public._k10_can_manage_company(_uid, _company_id);

  IF NOT _can_manage THEN
    -- common user: only own manual cards in own personal lane
    IF _card.card_type <> 'manual'
       OR _card.created_by IS DISTINCT FROM _uid
       OR _lane.is_personal IS DISTINCT FROM true
       OR _lane.owner_user_id IS DISTINCT FROM _uid THEN
      RAISE EXCEPTION 'forbidden_archive_card';
    END IF;
  END IF;

  UPDATE public.kanban_cards SET deleted_at=now(), updated_at=now() WHERE id=_card.id;

  INSERT INTO public.audit_logs(company_id,event_type,changed_by,metadata)
  VALUES (_company_id,'kanban.card_archived',_uid,
    jsonb_build_object('card_id',_card.id,'lane_id',_card.lane_id,'column_id',_card.column_id,
      'card_type',_card.card_type,'source','kanban_organization'));
END $$;

-- Archive column (blocks if active cards)
CREATE OR REPLACE FUNCTION public.archive_kanban_column(_company_id uuid, _column_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _col public.kanban_columns%ROWTYPE;
  _lane public.kanban_lanes%ROWTYPE;
  _cnt int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT * INTO _col FROM public.kanban_columns WHERE id=_column_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'column_not_found'; END IF;
  IF _col.company_id <> _company_id THEN RAISE EXCEPTION 'forbidden_company'; END IF;
  SELECT * INTO _lane FROM public.kanban_lanes WHERE id=_col.lane_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'lane_not_found'; END IF;
  PERFORM public._k10_check_lane_access(_uid, _company_id, _lane);

  SELECT count(*) INTO _cnt FROM public.kanban_cards WHERE column_id=_col.id AND deleted_at IS NULL;
  IF _cnt > 0 THEN RAISE EXCEPTION 'column_has_active_cards'; END IF;

  UPDATE public.kanban_columns SET deleted_at=now(), updated_at=now() WHERE id=_col.id;

  INSERT INTO public.audit_logs(company_id,event_type,changed_by,metadata)
  VALUES (_company_id,'kanban.column_archived',_uid,
    jsonb_build_object('column_id',_col.id,'lane_id',_col.lane_id,'source','kanban_organization'));
END $$;

-- Archive lane (blocks if active columns/cards)
CREATE OR REPLACE FUNCTION public.archive_kanban_lane(_company_id uuid, _lane_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _lane public.kanban_lanes%ROWTYPE;
  _cnt_cols int; _cnt_cards int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT * INTO _lane FROM public.kanban_lanes WHERE id=_lane_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lane_not_found'; END IF;
  PERFORM public._k10_check_lane_access(_uid, _company_id, _lane);

  SELECT count(*) INTO _cnt_cols FROM public.kanban_columns WHERE lane_id=_lane.id AND deleted_at IS NULL;
  SELECT count(*) INTO _cnt_cards FROM public.kanban_cards WHERE lane_id=_lane.id AND deleted_at IS NULL;
  IF _cnt_cols > 0 OR _cnt_cards > 0 THEN RAISE EXCEPTION 'lane_has_active_content'; END IF;

  UPDATE public.kanban_lanes SET deleted_at=now(), is_active=false, updated_at=now() WHERE id=_lane.id;

  INSERT INTO public.audit_logs(company_id,event_type,changed_by,metadata)
  VALUES (_company_id,'kanban.lane_archived',_uid,
    jsonb_build_object('lane_id',_lane.id,'source','kanban_organization'));
END $$;
