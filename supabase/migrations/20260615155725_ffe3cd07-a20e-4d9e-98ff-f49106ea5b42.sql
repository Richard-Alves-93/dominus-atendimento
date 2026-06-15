ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_reason text;

UPDATE public.messages
  SET delivery_status = CASE
    WHEN direction = 'inbound' THEN 'received'
    WHEN status IN ('sent','delivered','read','failed') THEN status
    ELSE 'sent'
  END
  WHERE delivery_status = 'sent';

UPDATE public.messages
  SET provider_message_id = external_id
  WHERE provider_message_id IS NULL AND external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS messages_provider_message_id_idx
  ON public.messages (provider_message_id);