GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, UPDATE ON public.companies TO authenticated;
GRANT SELECT ON public.company_users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channels TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_instances TO authenticated;
GRANT SELECT, INSERT ON public.channel_sync_logs TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

ALTER FUNCTION public.is_master(uuid) SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.user_belongs_to_company(uuid, uuid) SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.user_company_role(uuid, uuid) SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.is_master(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_belongs_to_company(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_company_role(uuid, uuid) TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own_or_master ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
DROP POLICY IF EXISTS company_users_select_own_or_master ON public.company_users;
DROP POLICY IF EXISTS companies_select_member_or_master ON public.companies;

CREATE POLICY profiles_select_own_or_master
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.is_master(auth.uid())
);

CREATE POLICY profiles_update_own
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  id = auth.uid()
)
WITH CHECK (
  id = auth.uid()
);

CREATE POLICY company_users_select_own_or_master
ON public.company_users
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_master(auth.uid())
);

CREATE POLICY companies_select_member_or_master
ON public.companies
FOR SELECT
TO authenticated
USING (
  public.is_master(auth.uid())
  OR public.user_belongs_to_company(auth.uid(), id)
);