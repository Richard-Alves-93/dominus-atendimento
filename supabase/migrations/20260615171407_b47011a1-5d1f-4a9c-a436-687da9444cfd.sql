
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS webhook_configured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS events_configured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_settings_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS settings_sync_error text;
