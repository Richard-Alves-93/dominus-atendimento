
-- 1. Setor: pode assumir atendimento parado
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS allow_stalled_takeover boolean NOT NULL DEFAULT false;

-- 2. Tabela de configurações de atendimento por empresa
CREATE TABLE IF NOT EXISTS public.company_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  allow_stalled_takeover boolean NOT NULL DEFAULT true,
  stalled_minutes integer NOT NULL DEFAULT 15 CHECK (stalled_minutes > 0),
  same_department_only boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_settings TO authenticated;
GRANT ALL ON public.company_settings TO service_role;

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_settings_select" ON public.company_settings
  FOR SELECT TO authenticated
  USING (
    app_private.is_master(auth.uid())
    OR app_private.user_belongs_to_company(auth.uid(), company_id)
  );

CREATE POLICY "company_settings_modify" ON public.company_settings
  FOR ALL TO authenticated
  USING (
    app_private.is_master(auth.uid())
    OR app_private.user_company_role(auth.uid(), company_id) = ANY (ARRAY['owner'::company_user_role, 'admin'::company_user_role])
  )
  WITH CHECK (
    app_private.is_master(auth.uid())
    OR app_private.user_company_role(auth.uid(), company_id) = ANY (ARRAY['owner'::company_user_role, 'admin'::company_user_role])
  );

CREATE TRIGGER trg_company_settings_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed defaults para empresas existentes
INSERT INTO public.company_settings (company_id)
SELECT id FROM public.companies
ON CONFLICT (company_id) DO NOTHING;

-- 3. Tabela de auditoria
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  previous_assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  new_assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_company_idx ON public.audit_logs (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_ticket_idx ON public.audit_logs (ticket_id);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_select" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    app_private.is_master(auth.uid())
    OR app_private.user_belongs_to_company(auth.uid(), company_id)
  );

CREATE POLICY "audit_logs_insert" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    app_private.is_master(auth.uid())
    OR app_private.user_belongs_to_company(auth.uid(), company_id)
  );
