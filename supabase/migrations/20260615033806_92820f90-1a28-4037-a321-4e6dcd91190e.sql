
-- Department status enum
DO $$ BEGIN
  CREATE TYPE public.department_status AS ENUM ('active','inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.department_user_role AS ENUM ('manager','agent','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.department_user_status AS ENUM ('active','inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- departments table
CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status public.department_status NOT NULL DEFAULT 'active',
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS departments_company_idx ON public.departments(company_id) WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS departments_select ON public.departments;
CREATE POLICY departments_select ON public.departments FOR SELECT TO authenticated
  USING (app_private.is_master(auth.uid()) OR app_private.user_belongs_to_company(auth.uid(), company_id));

DROP POLICY IF EXISTS departments_modify ON public.departments;
CREATE POLICY departments_modify ON public.departments FOR ALL TO authenticated
  USING (
    app_private.is_master(auth.uid())
    OR app_private.user_company_role(auth.uid(), company_id) IN ('owner','admin')
  )
  WITH CHECK (
    app_private.is_master(auth.uid())
    OR app_private.user_company_role(auth.uid(), company_id) IN ('owner','admin')
  );

DROP TRIGGER IF EXISTS trg_departments_updated_at ON public.departments;
CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- department_users table
CREATE TABLE IF NOT EXISTS public.department_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.department_user_role NOT NULL DEFAULT 'agent',
  status public.department_user_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department_id, user_id)
);
CREATE INDEX IF NOT EXISTS department_users_company_idx ON public.department_users(company_id);
CREATE INDEX IF NOT EXISTS department_users_user_idx ON public.department_users(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.department_users TO authenticated;
GRANT ALL ON public.department_users TO service_role;
ALTER TABLE public.department_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS department_users_select ON public.department_users;
CREATE POLICY department_users_select ON public.department_users FOR SELECT TO authenticated
  USING (app_private.is_master(auth.uid()) OR app_private.user_belongs_to_company(auth.uid(), company_id));

DROP POLICY IF EXISTS department_users_modify ON public.department_users;
CREATE POLICY department_users_modify ON public.department_users FOR ALL TO authenticated
  USING (
    app_private.is_master(auth.uid())
    OR app_private.user_company_role(auth.uid(), company_id) IN ('owner','admin')
  )
  WITH CHECK (
    app_private.is_master(auth.uid())
    OR app_private.user_company_role(auth.uid(), company_id) IN ('owner','admin')
  );

DROP TRIGGER IF EXISTS trg_department_users_updated_at ON public.department_users;
CREATE TRIGGER trg_department_users_updated_at BEFORE UPDATE ON public.department_users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- tickets: add department + assignment metadata
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tickets_department_idx ON public.tickets(department_id);

-- company_users: prepare disable / delayed-delete fields
ALTER TABLE public.company_users
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS disabled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS disabled_reason text,
  ADD COLUMN IF NOT EXISTS delete_after timestamptz;
