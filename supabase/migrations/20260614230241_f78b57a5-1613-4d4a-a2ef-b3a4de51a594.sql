
REVOKE ALL ON FUNCTION public.is_master(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.user_belongs_to_company(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.user_company_role(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
