CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.is_master(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT is_master = true OR global_role = 'master'
    FROM public.profiles
    WHERE id = _user_id
  ), false);
$$;

CREATE OR REPLACE FUNCTION app_private.user_belongs_to_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_users
    WHERE user_id = _user_id
      AND company_id = _company_id
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION app_private.user_company_role(_user_id uuid, _company_id uuid)
RETURNS public.company_user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.company_users
  WHERE user_id = _user_id
    AND company_id = _company_id
    AND status = 'active'
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION app_private.is_master(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION app_private.user_belongs_to_company(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION app_private.user_company_role(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.is_master(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.user_belongs_to_company(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.user_company_role(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS profiles_select_own_or_master ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own_or_master ON public.profiles;

CREATE POLICY profiles_select_own_or_master
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR app_private.is_master(auth.uid())
);

CREATE POLICY profiles_update_own
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS company_users_select_own_or_master ON public.company_users;
DROP POLICY IF EXISTS company_users_select_self_or_master ON public.company_users;
DROP POLICY IF EXISTS company_users_modify_owner_or_master ON public.company_users;

CREATE POLICY company_users_select_own_or_master
ON public.company_users
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR app_private.is_master(auth.uid())
);

CREATE POLICY company_users_modify_owner_or_master
ON public.company_users
FOR ALL
TO authenticated
USING (
  app_private.is_master(auth.uid())
  OR app_private.user_company_role(auth.uid(), company_id) = 'owner'
)
WITH CHECK (
  app_private.is_master(auth.uid())
  OR app_private.user_company_role(auth.uid(), company_id) = 'owner'
);

DROP POLICY IF EXISTS companies_select_member_or_master ON public.companies;
DROP POLICY IF EXISTS companies_insert_master ON public.companies;
DROP POLICY IF EXISTS companies_update_admin_or_master ON public.companies;
DROP POLICY IF EXISTS companies_delete_master ON public.companies;

CREATE POLICY companies_select_member_or_master
ON public.companies
FOR SELECT
TO authenticated
USING (
  app_private.is_master(auth.uid())
  OR app_private.user_belongs_to_company(auth.uid(), id)
);

CREATE POLICY companies_insert_master
ON public.companies
FOR INSERT
TO authenticated
WITH CHECK (app_private.is_master(auth.uid()));

CREATE POLICY companies_update_admin_or_master
ON public.companies
FOR UPDATE
TO authenticated
USING (
  app_private.is_master(auth.uid())
  OR app_private.user_company_role(auth.uid(), id) IN ('owner', 'admin')
)
WITH CHECK (
  app_private.is_master(auth.uid())
  OR app_private.user_company_role(auth.uid(), id) IN ('owner', 'admin')
);

CREATE POLICY companies_delete_master
ON public.companies
FOR DELETE
TO authenticated
USING (app_private.is_master(auth.uid()));

DROP POLICY IF EXISTS channels_select_member_or_master ON public.channels;
DROP POLICY IF EXISTS channels_modify_admin_or_master ON public.channels;

CREATE POLICY channels_select_member_or_master
ON public.channels
FOR SELECT
TO authenticated
USING (
  app_private.is_master(auth.uid())
  OR app_private.user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY channels_modify_admin_or_master
ON public.channels
FOR ALL
TO authenticated
USING (
  app_private.is_master(auth.uid())
  OR app_private.user_company_role(auth.uid(), company_id) IN ('owner', 'admin', 'manager')
)
WITH CHECK (
  app_private.is_master(auth.uid())
  OR app_private.user_company_role(auth.uid(), company_id) IN ('owner', 'admin', 'manager')
);

DROP POLICY IF EXISTS wa_instances_select_member_or_master ON public.whatsapp_instances;
DROP POLICY IF EXISTS wa_instances_modify_admin_or_master ON public.whatsapp_instances;

CREATE POLICY wa_instances_select_member_or_master
ON public.whatsapp_instances
FOR SELECT
TO authenticated
USING (
  app_private.is_master(auth.uid())
  OR app_private.user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY wa_instances_modify_admin_or_master
ON public.whatsapp_instances
FOR ALL
TO authenticated
USING (
  app_private.is_master(auth.uid())
  OR app_private.user_company_role(auth.uid(), company_id) IN ('owner', 'admin', 'manager')
)
WITH CHECK (
  app_private.is_master(auth.uid())
  OR app_private.user_company_role(auth.uid(), company_id) IN ('owner', 'admin', 'manager')
);

DROP POLICY IF EXISTS sync_logs_select_member_or_master ON public.channel_sync_logs;
DROP POLICY IF EXISTS sync_logs_insert_member_or_master ON public.channel_sync_logs;

CREATE POLICY sync_logs_select_member_or_master
ON public.channel_sync_logs
FOR SELECT
TO authenticated
USING (
  app_private.is_master(auth.uid())
  OR app_private.user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY sync_logs_insert_member_or_master
ON public.channel_sync_logs
FOR INSERT
TO authenticated
WITH CHECK (
  app_private.is_master(auth.uid())
  OR app_private.user_belongs_to_company(auth.uid(), company_id)
);