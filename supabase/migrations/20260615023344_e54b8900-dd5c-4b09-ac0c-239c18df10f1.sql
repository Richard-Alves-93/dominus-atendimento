
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

INSERT INTO public.companies (name, email, status, is_internal)
SELECT 'Dominus Atendimento', 'crmdominus@gmail.com', 'active'::company_status, true
WHERE NOT EXISTS (SELECT 1 FROM public.companies WHERE is_internal = true);

INSERT INTO public.company_users (company_id, user_id, role, status)
SELECT c.id, p.id, 'owner'::company_user_role, 'active'::company_user_status
FROM public.companies c
CROSS JOIN public.profiles p
WHERE c.is_internal = true
  AND p.email = 'crmdominus@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.company_users cu WHERE cu.company_id = c.id AND cu.user_id = p.id
  );
