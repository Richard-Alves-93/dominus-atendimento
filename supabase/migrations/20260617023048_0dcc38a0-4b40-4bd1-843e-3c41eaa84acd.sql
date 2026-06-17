
ALTER TABLE public.scheduled_events
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS delete_reason text;

CREATE INDEX IF NOT EXISTS idx_scheduled_events_not_deleted
  ON public.scheduled_events (company_id, start_at)
  WHERE deleted_at IS NULL;
