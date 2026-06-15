
-- 1) Prevent privilege escalation on profiles insert
DROP POLICY IF EXISTS profiles_insert_self ON public.profiles;
CREATE POLICY profiles_insert_self ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (
  id = auth.uid()
  AND COALESCE(is_master, false) = false
  AND COALESCE(global_role, 'user') = 'user'
);

-- Block clients from updating is_master/global_role on themselves
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF app_private.is_master(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.is_master IS DISTINCT FROM OLD.is_master
     OR NEW.global_role IS DISTINCT FROM OLD.global_role THEN
    RAISE EXCEPTION 'not allowed to change privilege fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_priv_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_priv_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 2) Allow active company members (including agents) to SELECT peer profiles
DROP POLICY IF EXISTS profiles_select_company_members ON public.profiles;
CREATE POLICY profiles_select_company_members ON public.profiles
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.company_users cu_self
    JOIN public.company_users cu_target
      ON cu_target.company_id = cu_self.company_id
    WHERE cu_self.user_id = auth.uid()
      AND cu_self.status = 'active'
      AND cu_target.user_id = profiles.id
      AND cu_target.status = 'active'
  )
);

-- 3) audit_logs INSERT — restrict to owner/admin or master
DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;
CREATE POLICY audit_logs_insert ON public.audit_logs
FOR INSERT TO authenticated
WITH CHECK (
  app_private.is_master(auth.uid())
  OR (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.user_id = auth.uid()
        AND cu.company_id = audit_logs.company_id
        AND cu.status = 'active'
        AND cu.role IN ('owner','admin')
    )
  )
);

-- 4) channel_sync_logs INSERT — restrict to owner/admin/manager or master
DROP POLICY IF EXISTS sync_logs_insert_member_or_master ON public.channel_sync_logs;
CREATE POLICY sync_logs_insert_priv_or_master ON public.channel_sync_logs
FOR INSERT TO authenticated
WITH CHECK (
  app_private.is_master(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.user_id = auth.uid()
      AND cu.company_id = channel_sync_logs.company_id
      AND cu.status = 'active'
      AND cu.role IN ('owner','admin','manager')
  )
);
