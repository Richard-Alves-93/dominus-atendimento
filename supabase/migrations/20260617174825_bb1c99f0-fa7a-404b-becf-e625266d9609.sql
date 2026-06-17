
REVOKE ALL ON FUNCTION public.generate_ticket_protocol(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.tickets_assign_protocol() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tickets_assign_protocol() FROM anon;
REVOKE ALL ON FUNCTION public.tickets_assign_protocol() FROM authenticated;
