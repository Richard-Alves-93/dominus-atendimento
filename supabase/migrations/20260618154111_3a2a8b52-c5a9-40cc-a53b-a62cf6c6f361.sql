CREATE OR REPLACE FUNCTION public.reconcile_suspicious_contact_names(
  p_company_id uuid,
  p_suspicious_name text,
  p_dry_run boolean DEFAULT true
)
RETURNS TABLE(
  contact_id uuid,
  old_name text,
  new_name text,
  action text,
  reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _allowed boolean := false;
  _suspect text := NULLIF(BTRIM(p_suspicious_name), '');
  _row record;
  _new_name text;
  _action text;
  _reason text;
  _metadata jsonb;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_company_id IS NULL OR _suspect IS NULL OR LENGTH(_suspect) < 2 OR LENGTH(_suspect) > 120 THEN
    RAISE EXCEPTION 'Invalid reconciliation parameters';
  END IF;

  SELECT (
    public.is_master(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.company_users cu
      WHERE cu.company_id = p_company_id
        AND cu.user_id = _user_id
        AND cu.status = 'active'
        AND cu.role::text IN ('owner', 'admin')
    )
  ) INTO _allowed;

  IF NOT _allowed THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  FOR _row IN
    SELECT
      c.id,
      c.name,
      COALESCE(c.metadata, '{}'::jsonb) AS metadata,
      first_msg.from_me AS first_from_me,
      first_msg.source AS first_source,
      NULLIF(BTRIM(latest_in.raw->>'pushName'), '') AS latest_inbound_push_name
    FROM public.contacts c
    LEFT JOIN LATERAL (
      SELECT m.from_me, m.source, m.created_at
      FROM public.messages m
      WHERE m.contact_id = c.id
        AND m.company_id = c.company_id
      ORDER BY m.created_at ASC
      LIMIT 1
    ) first_msg ON true
    LEFT JOIN LATERAL (
      SELECT m.raw, m.created_at
      FROM public.messages m
      WHERE m.contact_id = c.id
        AND m.company_id = c.company_id
        AND m.from_me = false
        AND NULLIF(BTRIM(m.raw->>'pushName'), '') IS NOT NULL
      ORDER BY m.created_at DESC
      LIMIT 1
    ) latest_in ON true
    WHERE c.company_id = p_company_id
      AND BTRIM(c.name) = _suspect
      AND first_msg.from_me IS TRUE
  LOOP
    _new_name := _row.latest_inbound_push_name;
    IF _new_name IS NOT NULL AND LOWER(_new_name) = LOWER(_suspect) THEN
      _new_name := NULL;
    END IF;

    IF _new_name IS NULL THEN
      _action := 'cleared_to_phone_fallback';
      _reason := 'first_message_from_me_no_legitimate_inbound_name';
    ELSE
      _action := 'updated_from_latest_inbound_push_name';
      _reason := 'first_message_from_me_later_inbound_push_name_found';
    END IF;

    IF NOT p_dry_run THEN
      _metadata := (_row.metadata - 'push_name' - 'pushName' - 'profile_name' - 'profileName')
        || jsonb_build_object(
          'contact_reconciliation', jsonb_build_object(
            'at', now(),
            'reason', _reason,
            'old_name_present', true,
            'new_name_null_or_updated', CASE WHEN _new_name IS NULL THEN 'null' ELSE 'updated' END
          )
        );

      UPDATE public.contacts
      SET name = _new_name,
          metadata = _metadata,
          updated_at = now()
      WHERE id = _row.id
        AND company_id = p_company_id
        AND name IS NOT DISTINCT FROM _row.name;

      INSERT INTO public.audit_logs (
        company_id,
        event_type,
        changed_by,
        reason,
        metadata
      ) VALUES (
        p_company_id,
        'contact_reconciliation',
        _user_id,
        _reason,
        jsonb_build_object(
          'contact_id', _row.id,
          'old_name_present', true,
          'new_name_null_or_updated', CASE WHEN _new_name IS NULL THEN 'null' ELSE 'updated' END,
          'source', 'reconcile_suspicious_contact_names'
        )
      );
    END IF;

    contact_id := _row.id;
    old_name := _row.name;
    new_name := _new_name;
    action := _action;
    reason := _reason;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_suspicious_contact_names(uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_suspicious_contact_names(uuid, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.reconcile_suspicious_contact_names(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_suspicious_contact_names(uuid, text, boolean) TO service_role;