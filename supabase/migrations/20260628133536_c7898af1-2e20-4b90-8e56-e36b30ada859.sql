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
  -- Lock a batch of pending jobs (use array_agg to capture all returned ids into uuid[])
  WITH picked AS (
    SELECT id FROM public.tag_automation_jobs
     WHERE status = 'pending' AND run_after <= now()
     ORDER BY created_at ASC
     LIMIT GREATEST(_limit, 1)
     FOR UPDATE SKIP LOCKED
  ),
  upd AS (
    UPDATE public.tag_automation_jobs j
       SET status='processing', locked_at=now(), locked_by=_worker,
           started_at=now(), attempts=attempts+1, updated_at=now()
      FROM picked
     WHERE j.id = picked.id
    RETURNING j.id
  )
  SELECT array_agg(id) INTO _job_ids FROM upd;

  IF _job_ids IS NULL OR array_length(_job_ids, 1) IS NULL THEN
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
             locked_at = NULL, locked_by = NULL,
             finished_at = CASE WHEN attempts >= max_attempts THEN now() ELSE NULL END,
             updated_at = now()
       WHERE id = _job.id;
      INSERT INTO public.audit_logs(company_id,event_type,ticket_id,changed_by,metadata)
      VALUES (_job.company_id,'automation.failed',_job.ticket_id,NULL,
        jsonb_build_object('automation_id',_job.automation_id,'job_id',_job.id,
          'reason','exception','source','tag_applied','error',SQLERRM));
      _failed := _failed + 1;
    END;
  END LOOP;

  processed:=_processed; done:=_done; skipped:=_skipped; failed:=_failed;
  RETURN NEXT;
END $$;

REVOKE ALL ON FUNCTION public.process_tag_automation_jobs(int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_tag_automation_jobs(int, text) TO service_role;