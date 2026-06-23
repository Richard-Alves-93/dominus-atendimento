
-- C.1 — Oportunidade/Venda vinculada ao atendimento
CREATE TABLE IF NOT EXISTS public.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost','canceled')),
  amount numeric(14,2),
  currency text NOT NULL DEFAULT 'BRL',
  source text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS opportunities_company_idx ON public.opportunities(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS opportunities_ticket_idx ON public.opportunities(ticket_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS opportunities_contact_idx ON public.opportunities(contact_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS opportunities_assigned_user_idx ON public.opportunities(assigned_user_id) WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.opportunities TO authenticated;
GRANT ALL ON public.opportunities TO service_role;

ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

-- updated_at trigger
DROP TRIGGER IF EXISTS opportunities_set_updated_at ON public.opportunities;
CREATE TRIGGER opportunities_set_updated_at
BEFORE UPDATE ON public.opportunities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Validate cross-tenant references on insert/update
CREATE OR REPLACE FUNCTION public.opportunities_validate_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _c uuid;
BEGIN
  IF NEW.ticket_id IS NOT NULL THEN
    SELECT company_id INTO _c FROM public.tickets WHERE id = NEW.ticket_id;
    IF _c IS NULL OR _c <> NEW.company_id THEN
      RAISE EXCEPTION 'ticket_id must belong to the same company';
    END IF;
  END IF;
  IF NEW.contact_id IS NOT NULL THEN
    SELECT company_id INTO _c FROM public.contacts WHERE id = NEW.contact_id;
    IF _c IS NULL OR _c <> NEW.company_id THEN
      RAISE EXCEPTION 'contact_id must belong to the same company';
    END IF;
  END IF;
  IF NEW.department_id IS NOT NULL THEN
    SELECT company_id INTO _c FROM public.departments WHERE id = NEW.department_id;
    IF _c IS NULL OR _c <> NEW.company_id THEN
      RAISE EXCEPTION 'department_id must belong to the same company';
    END IF;
  END IF;
  IF NEW.status IN ('won','lost','canceled') AND NEW.closed_at IS NULL THEN
    NEW.closed_at := now();
  END IF;
  IF NEW.status = 'open' THEN
    NEW.closed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS opportunities_validate_company_trg ON public.opportunities;
CREATE TRIGGER opportunities_validate_company_trg
BEFORE INSERT OR UPDATE ON public.opportunities
FOR EACH ROW EXECUTE FUNCTION public.opportunities_validate_company();

-- RLS policies — restrict by company membership; Master sees all
CREATE POLICY "opportunities_select"
ON public.opportunities FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL AND (
    public.is_master(auth.uid())
    OR public.user_belongs_to_company(auth.uid(), company_id)
  )
);

CREATE POLICY "opportunities_insert"
ON public.opportunities FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid() AND (
    public.is_master(auth.uid())
    OR public.user_belongs_to_company(auth.uid(), company_id)
  )
);

CREATE POLICY "opportunities_update"
ON public.opportunities FOR UPDATE
TO authenticated
USING (
  public.is_master(auth.uid())
  OR public.user_belongs_to_company(auth.uid(), company_id)
)
WITH CHECK (
  public.is_master(auth.uid())
  OR public.user_belongs_to_company(auth.uid(), company_id)
);
