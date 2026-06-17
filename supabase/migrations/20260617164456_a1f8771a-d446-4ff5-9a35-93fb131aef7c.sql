ALTER TABLE public.scheduled_messages DROP CONSTRAINT IF EXISTS scheduled_messages_type_check;
ALTER TABLE public.scheduled_messages ADD CONSTRAINT scheduled_messages_type_check
  CHECK (type = ANY (ARRAY['event_confirmation','event_reminder_1h','event_reminder_5m','event_rescheduled','event_cancellation','event_updated','sales_followup','custom_followup']));