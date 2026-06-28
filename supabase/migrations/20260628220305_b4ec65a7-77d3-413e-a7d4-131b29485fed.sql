
CREATE OR REPLACE FUNCTION public.reorder_kanban_card_to_position(
  _company_id uuid,
  _card_id uuid,
  _new_index integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_card record;
  v_old_position integer;
  v_new_position integer;
  v_ids uuid[];
  v_filtered uuid[];
  v_id uuid;
  v_pos integer := 1;
  v_target integer;
  v_len integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT id, company_id, column_id, lane_id, position
    INTO v_card
  FROM public.kanban_cards
  WHERE id = _card_id AND company_id = _company_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'card_not_found'; END IF;

  PERFORM 1 FROM public.kanban_columns
    WHERE id = v_card.column_id AND company_id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'column_company_mismatch'; END IF;

  v_old_position := v_card.position;

  SELECT array_agg(id ORDER BY position, created_at)
    INTO v_ids
  FROM public.kanban_cards
  WHERE company_id = _company_id
    AND column_id = v_card.column_id;

  IF v_ids IS NULL THEN RETURN; END IF;

  v_filtered := ARRAY(SELECT id FROM unnest(v_ids) AS id WHERE id <> _card_id);
  v_len := COALESCE(array_length(v_filtered, 1), 0);

  v_target := GREATEST(0, LEAST(_new_index, v_len));

  v_filtered := v_filtered[1:v_target] || ARRAY[_card_id] || v_filtered[v_target+1:v_len];

  FOREACH v_id IN ARRAY v_filtered LOOP
    UPDATE public.kanban_cards SET position = v_pos WHERE id = v_id;
    v_pos := v_pos + 1;
  END LOOP;

  SELECT position INTO v_new_position FROM public.kanban_cards WHERE id = _card_id;

  INSERT INTO public.audit_logs (company_id, user_id, action, metadata)
  VALUES (
    _company_id, v_user, 'kanban.card_reordered',
    jsonb_build_object(
      'card_id', _card_id,
      'lane_id', v_card.lane_id,
      'column_id', v_card.column_id,
      'old_position', v_old_position,
      'new_position', v_new_position,
      'source', 'drag_handle'
    )
  );
END;
$$;
