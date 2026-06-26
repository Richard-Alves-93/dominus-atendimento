
-- Garantir colunas necessárias em ticket_transfers
ALTER TABLE public.ticket_transfers
  ADD COLUMN IF NOT EXISTS accepted_by uuid,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS returned_at timestamptz,
  ADD COLUMN IF NOT EXISTS returned_to_user_id uuid;

CREATE INDEX IF NOT EXISTS idx_ticket_transfers_pending_deadline
  ON public.ticket_transfers (status, return_deadline_at)
  WHERE status = 'pending';

-- Advisory lock helpers
CREATE OR REPLACE FUNCTION public.try_kanban_returns_cron_lock()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT pg_try_advisory_lock(91823472); $$;

CREATE OR REPLACE FUNCTION public.release_kanban_returns_cron_lock()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT pg_advisory_unlock(91823472); $$;

-- Função principal
CREATE OR REPLACE FUNCTION public.process_due_ticket_transfer_returns(_limit integer DEFAULT 200)
RETURNS TABLE(processed integer, returned integer, accepted integer, skipped integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _t public.ticket_transfers%ROWTYPE;
  _ticket public.tickets%ROWTYPE;
  _processed int := 0;
  _returned int := 0;
  _accepted int := 0;
  _skipped int := 0;
  _user_active boolean;
  _prev_name text;
  _from_dept_name text;
  _to_dept_name text;
  _new_assignee uuid;
  _new_dept uuid;
  _msg text;
  _got_lock boolean;
BEGIN
  -- Apenas service_role / chamadas internas (auth.uid() is null em chamadas de cron)
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (is_master = true OR global_role = 'master')) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  SELECT public.try_kanban_returns_cron_lock() INTO _got_lock;
  IF NOT _got_lock THEN
    RETURN QUERY SELECT 0,0,0,0;
    RETURN;
  END IF;

  FOR _t IN
    SELECT * FROM public.ticket_transfers
    WHERE status = 'pending'
      AND (
        (return_if_unassigned = true AND return_deadline_at IS NOT NULL AND return_deadline_at <= now())
        OR true  -- também avaliamos accepted independente do prazo
      )
    ORDER BY return_deadline_at NULLS LAST
    LIMIT GREATEST(_limit, 1)
    FOR UPDATE SKIP LOCKED
  LOOP
    _processed := _processed + 1;

    SELECT * INTO _ticket FROM public.tickets WHERE id = _t.ticket_id FOR UPDATE;
    IF NOT FOUND THEN
      UPDATE public.ticket_transfers SET status='skipped', updated_at=now() WHERE id=_t.id;
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;

    -- Caso 1: alguém assumiu antes do prazo
    IF _ticket.assigned_user_id IS NOT NULL
       AND _ticket.department_id = _t.to_department_id THEN
      UPDATE public.ticket_transfers
         SET status='accepted',
             accepted_by = _ticket.assigned_user_id,
             accepted_at = COALESCE(_ticket.assigned_at, now()),
             updated_at = now()
       WHERE id = _t.id AND status='pending';
      INSERT INTO public.audit_logs (company_id, event_type, ticket_id, changed_by, metadata)
      VALUES (_t.company_id, 'ticket.transfer_accepted', _t.ticket_id, NULL,
        jsonb_build_object(
          'ticket_transfer_id', _t.id,
          'ticket_id', _t.ticket_id,
          'from_department_id', _t.from_department_id,
          'to_department_id', _t.to_department_id,
          'accepted_by', _ticket.assigned_user_id,
          'source', 'kanban_return_cron'
        ));
      _accepted := _accepted + 1;
      CONTINUE;
    END IF;

    -- Caso 2: prazo ainda não venceu ou retorno não configurado -> pular
    IF COALESCE(_t.return_if_unassigned,false) = false
       OR _t.return_deadline_at IS NULL
       OR _t.return_deadline_at > now() THEN
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;

    -- Validações para retorno
    IF _ticket.status = 'closed' THEN
      UPDATE public.ticket_transfers SET status='skipped', updated_at=now() WHERE id=_t.id;
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;

    -- ticket precisa ainda estar no setor destino e sem responsável
    IF _ticket.department_id IS DISTINCT FROM _t.to_department_id
       OR _ticket.assigned_user_id IS NOT NULL THEN
      UPDATE public.ticket_transfers SET status='skipped', updated_at=now() WHERE id=_t.id;
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;

    -- Determinar destino
    _new_dept := _t.from_department_id;
    _new_assignee := NULL;

    IF _t.return_target = 'previous_user' AND _t.from_user_id IS NOT NULL THEN
      SELECT EXISTS(
        SELECT 1 FROM public.company_users
        WHERE user_id = _t.from_user_id
          AND company_id = _t.company_id
          AND status = 'active'
      ) INTO _user_active;
      IF _user_active THEN
        _new_assignee := _t.from_user_id;
      END IF;
    END IF;

    -- Atualiza ticket
    UPDATE public.tickets
       SET department_id = _new_dept,
           assigned_user_id = _new_assignee,
           assigned_at = CASE WHEN _new_assignee IS NOT NULL THEN now() ELSE NULL END,
           assigned_by = NULL,
           updated_at = now()
     WHERE id = _t.ticket_id;

    -- Atualiza transferência
    UPDATE public.ticket_transfers
       SET status = 'returned',
           returned_at = now(),
           returned_to_user_id = _new_assignee,
           updated_at = now()
     WHERE id = _t.id AND status = 'pending';

    -- Auditoria
    INSERT INTO public.audit_logs (company_id, event_type, ticket_id, changed_by, metadata)
    VALUES (_t.company_id, 'ticket.transfer_returned_automatically', _t.ticket_id, NULL,
      jsonb_build_object(
        'ticket_transfer_id', _t.id,
        'ticket_id', _t.ticket_id,
        'from_department_id', _t.from_department_id,
        'to_department_id', _t.to_department_id,
        'from_user_id', _t.from_user_id,
        'return_target', _t.return_target,
        'returned_to_user_id', _new_assignee,
        'source', 'kanban_return_cron'
      ));

    -- Evento interno
    SELECT name INTO _from_dept_name FROM public.departments WHERE id = _t.from_department_id;
    SELECT name INTO _to_dept_name FROM public.departments WHERE id = _t.to_department_id;
    IF _new_assignee IS NOT NULL THEN
      SELECT full_name INTO _prev_name FROM public.profiles WHERE id = _new_assignee;
      _msg := 'Atendimento retornou automaticamente para ' || COALESCE(_prev_name,'atendente anterior') ||
              ' porque o setor ' || COALESCE(_to_dept_name,'destino') || ' não assumiu dentro do prazo.';
    ELSE
      _msg := 'Atendimento retornou automaticamente para o setor ' || COALESCE(_from_dept_name,'origem') ||
              ' porque o setor ' || COALESCE(_to_dept_name,'destino') || ' não assumiu dentro do prazo.';
    END IF;

    BEGIN
      INSERT INTO public.messages (
        company_id, ticket_id, contact_id, channel_id,
        direction, from_me, msg_type, source, body, delivery_status
      ) VALUES (
        _t.company_id, _t.ticket_id, _ticket.contact_id, NULL,
        'inbound', false, 'system', 'system', _msg, 'sent'
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    _returned := _returned + 1;
  END LOOP;

  PERFORM public.release_kanban_returns_cron_lock();

  RETURN QUERY SELECT _processed, _returned, _accepted, _skipped;
END;
$$;

REVOKE ALL ON FUNCTION public.process_due_ticket_transfer_returns(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_due_ticket_transfer_returns(integer) TO service_role;
