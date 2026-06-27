
-- Normalize positions before swap in lane/column reorder RPCs (K.10 fix)

CREATE OR REPLACE FUNCTION public.reorder_kanban_lane(_company_id uuid, _lane_id uuid, _direction text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Normalize positions (sequential 1..N) within the scope, handling nulls/duplicates
  IF _lane.is_personal THEN
    WITH ordered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY position ASC NULLS LAST, created_at ASC) AS rn
      FROM public.kanban_lanes
      WHERE company_id=_company_id AND deleted_at IS NULL AND is_personal=true AND owner_user_id=_uid
    )
    UPDATE public.kanban_lanes l SET position = o.rn FROM ordered o
    WHERE l.id = o.id AND (l.position IS DISTINCT FROM o.rn);
  ELSE
    WITH ordered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY position ASC NULLS LAST, created_at ASC) AS rn
      FROM public.kanban_lanes
      WHERE company_id=_company_id AND deleted_at IS NULL AND is_personal=false
    )
    UPDATE public.kanban_lanes l SET position = o.rn FROM ordered o
    WHERE l.id = o.id AND (l.position IS DISTINCT FROM o.rn);
  END IF;

  -- Re-read lane after normalization
  SELECT * INTO _lane FROM public.kanban_lanes WHERE id=_lane_id FOR UPDATE;

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
  -- Two-step swap to avoid unique conflicts if any
  UPDATE public.kanban_lanes SET position=-1, updated_at=now() WHERE id=_lane.id;
  UPDATE public.kanban_lanes SET position=_old_pos, updated_at=now() WHERE id=_other.id;
  UPDATE public.kanban_lanes SET position=_new_pos, updated_at=now() WHERE id=_lane.id;

  INSERT INTO public.audit_logs(company_id,event_type,changed_by,metadata)
  VALUES (_company_id,'kanban.lane_reordered',_uid,
    jsonb_build_object('lane_id',_lane.id,'old_position',_old_pos,'new_position',_new_pos,
      'swapped_with_lane_id',_other.id,'direction',_direction,'source','kanban_organization'));
END $function$;

CREATE OR REPLACE FUNCTION public.reorder_kanban_column(_company_id uuid, _column_id uuid, _direction text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Normalize positions within the lane (handle nulls/duplicates)
  WITH ordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY position ASC NULLS LAST, created_at ASC) AS rn
    FROM public.kanban_columns
    WHERE lane_id=_col.lane_id AND deleted_at IS NULL
  )
  UPDATE public.kanban_columns c SET position = o.rn FROM ordered o
  WHERE c.id = o.id AND (c.position IS DISTINCT FROM o.rn);

  SELECT * INTO _col FROM public.kanban_columns WHERE id=_column_id FOR UPDATE;

  SELECT * INTO _other FROM public.kanban_columns
   WHERE lane_id=_col.lane_id AND deleted_at IS NULL AND id <> _col.id
     AND (( _direction='left' AND position < _col.position) OR (_direction='right' AND position > _col.position))
   ORDER BY CASE WHEN _direction='left' THEN position END DESC,
            CASE WHEN _direction='right' THEN position END ASC
   LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  _old_pos := _col.position; _new_pos := _other.position;
  UPDATE public.kanban_columns SET position=-1, updated_at=now() WHERE id=_col.id;
  UPDATE public.kanban_columns SET position=_old_pos, updated_at=now() WHERE id=_other.id;
  UPDATE public.kanban_columns SET position=_new_pos, updated_at=now() WHERE id=_col.id;

  INSERT INTO public.audit_logs(company_id,event_type,changed_by,metadata)
  VALUES (_company_id,'kanban.column_reordered',_uid,
    jsonb_build_object('column_id',_col.id,'lane_id',_col.lane_id,'old_position',_old_pos,'new_position',_new_pos,
      'swapped_with_column_id',_other.id,'direction',_direction,'source','kanban_organization'));
END $function$;
