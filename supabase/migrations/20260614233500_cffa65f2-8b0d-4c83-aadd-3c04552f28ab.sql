REVOKE EXECUTE ON FUNCTION public.is_master(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_belongs_to_company(uuid, uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_company_role(uuid, uuid) FROM anon, authenticated, PUBLIC;