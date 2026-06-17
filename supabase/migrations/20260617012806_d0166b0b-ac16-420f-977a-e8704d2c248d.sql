
REVOKE EXECUTE ON FUNCTION public.user_can_view_event(uuid,uuid,uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_event_scheduled_messages() FROM PUBLIC, anon, authenticated;
