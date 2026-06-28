
-- 1) Audit log entries (one per contact) — must run BEFORE the update so we can read old values
INSERT INTO public.audit_logs (company_id, event_type, reason, metadata)
SELECT
  c.company_id,
  'contacts.lid_cleanup',
  'whatsapp_lid_identifier',
  jsonb_build_object(
    'contact_id', c.id,
    'old_phone_masked', CASE
      WHEN length(coalesce(c.phone_number,'')) >= 6
        THEN left(c.phone_number, 4) || '***' || right(c.phone_number, 2)
      ELSE '***'
    END,
    'phone_length', length(regexp_replace(coalesce(c.phone_number,''), '\D', '', 'g')),
    'reason', 'whatsapp_lid_identifier',
    'source', 'lid_contacts_cleanup'
  )
FROM public.contacts c
WHERE length(regexp_replace(coalesce(c.phone_number,''), '\D', '', 'g')) > 13
  AND coalesce((c.metadata->>'invalid')::boolean, false) = false;

-- 2) Mark contacts as invalid (do not delete; preserve all FKs and history)
UPDATE public.contacts
SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'invalid', true,
      'invalid_reason', 'whatsapp_lid_identifier',
      'cleanup_source', 'lid_contacts_cleanup',
      'invalidated_at', to_jsonb(now())
    ),
    updated_at = now()
WHERE length(regexp_replace(coalesce(phone_number,''), '\D', '', 'g')) > 13
  AND coalesce((metadata->>'invalid')::boolean, false) = false;

-- 3) Partial index to keep the operational contact list query fast
CREATE INDEX IF NOT EXISTS contacts_valid_company_updated_idx
  ON public.contacts (company_id, updated_at DESC)
  WHERE coalesce((metadata->>'invalid')::boolean, false) = false;
