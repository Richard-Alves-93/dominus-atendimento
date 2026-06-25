
CREATE OR REPLACE FUNCTION public.update_commission_status(_commission_id uuid, _action text)
RETURNS public.sales_commissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _c public.sales_commissions%ROWTYPE;
  _role company_user_role;
  _is_master boolean;
  _new_status text;
  _event_type text;
  _seller_name text;
  _msg text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT * INTO _c FROM public.sales_commissions WHERE id = _commission_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'commission_not_found';
  END IF;

  SELECT COALESCE(is_master, false) OR COALESCE(global_role = 'master', false)
    INTO _is_master FROM public.profiles WHERE id = auth.uid();

  IF NOT _is_master THEN
    SELECT role INTO _role FROM public.company_users
      WHERE user_id = auth.uid() AND company_id = _c.company_id AND status = 'active';
    IF _role IS NULL OR _role NOT IN ('owner','admin','financial') THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  IF _action = 'approve' THEN
    IF _c.status <> 'pending' THEN RAISE EXCEPTION 'invalid_transition'; END IF;
    _new_status := 'approved';
    _event_type := 'commission.approved';
    _msg := 'Comissão aprovada no valor de R$ ' || to_char(_c.commission_amount, 'FM999G999G990D00') || '.';
    UPDATE public.sales_commissions SET status = 'approved', updated_at = now() WHERE id = _c.id;
  ELSIF _action = 'pay' THEN
    IF _c.status <> 'approved' THEN RAISE EXCEPTION 'invalid_transition'; END IF;
    _new_status := 'paid';
    _event_type := 'commission.paid';
    _msg := 'Comissão marcada como paga no valor de R$ ' || to_char(_c.commission_amount, 'FM999G999G990D00') || '.';
    UPDATE public.sales_commissions SET status = 'paid', paid_at = now(), updated_at = now() WHERE id = _c.id;
  ELSIF _action = 'cancel' THEN
    IF _c.status NOT IN ('pending','approved') THEN RAISE EXCEPTION 'invalid_transition'; END IF;
    _new_status := 'canceled';
    _event_type := 'commission.canceled_manual';
    _msg := 'Comissão cancelada manualmente.';
    UPDATE public.sales_commissions SET status = 'canceled', updated_at = now() WHERE id = _c.id;
  ELSE
    RAISE EXCEPTION 'invalid_action';
  END IF;

  INSERT INTO public.audit_logs (company_id, event_type, ticket_id, changed_by, metadata)
  VALUES (_c.company_id, _event_type, _c.ticket_id, auth.uid(),
    jsonb_build_object(
      'commission_id', _c.id,
      'opportunity_id', _c.opportunity_id,
      'seller_user_id', _c.seller_user_id,
      'old_status', _c.status,
      'new_status', _new_status,
      'commission_amount', _c.commission_amount,
      'paid_at', CASE WHEN _new_status = 'paid' THEN now() ELSE NULL END,
      'source', 'commissions_screen'
    ));

  IF _c.ticket_id IS NOT NULL AND _c.contact_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.messages (
        company_id, ticket_id, contact_id, channel_id,
        direction, from_me, msg_type, source, body, delivery_status
      ) VALUES (
        _c.company_id, _c.ticket_id, _c.contact_id, NULL,
        'inbound', false, 'system', 'system', _msg, 'sent'
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  SELECT * INTO _c FROM public.sales_commissions WHERE id = _commission_id;
  RETURN _c;
END;
$$;

REVOKE ALL ON FUNCTION public.update_commission_status(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_commission_status(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_commission_status(uuid, text) TO authenticated;
