
UPDATE public.messages
SET
  failure_reason = 'Falha antes da reconexão do WhatsApp',
  raw = COALESCE(raw, '{}'::jsonb) || jsonb_build_object(
    'historical_failure', true,
    'failure_context', 'pre_evolution_hard_reset',
    'original_failure_reason', failure_reason
  )
WHERE from_me = true
  AND (status = 'failed' OR delivery_status = 'failed')
  AND created_at < '2026-06-29 02:00:00+00'
  AND (raw->>'historical_failure') IS DISTINCT FROM 'true';
