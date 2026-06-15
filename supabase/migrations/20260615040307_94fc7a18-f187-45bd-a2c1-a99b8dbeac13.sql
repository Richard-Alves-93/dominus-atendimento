
-- profiles: extra fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS temporary_password_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS public_name text,
  ADD COLUMN IF NOT EXISTS signature text,
  ADD COLUMN IF NOT EXISTS signature_enabled boolean NOT NULL DEFAULT true;

-- messages: signature tracking
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS sent_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS sent_by_name text,
  ADD COLUMN IF NOT EXISTS sent_by_signature text,
  ADD COLUMN IF NOT EXISTS raw_body text;

-- helper functions for department-scoped permissions
CREATE OR REPLACE FUNCTION app_private.user_in_department(_user_id uuid, _department_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.department_users
    WHERE user_id = _user_id AND department_id = _department_id AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION app_private.user_manages_department(_user_id uuid, _department_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.department_users
    WHERE user_id = _user_id AND department_id = _department_id AND status = 'active' AND role = 'manager'
  );
$$;

-- Allow company members to see profiles of teammates (needed by Equipe page)
DROP POLICY IF EXISTS profiles_select_company_members ON public.profiles;
CREATE POLICY profiles_select_company_members ON public.profiles
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.company_users cu_self
    JOIN public.company_users cu_target ON cu_target.company_id = cu_self.company_id
    WHERE cu_self.user_id = auth.uid()
      AND cu_self.status = 'active'
      AND cu_self.role IN ('owner','admin','manager')
      AND cu_target.user_id = public.profiles.id
  )
);
