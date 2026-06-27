
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS default_inbox_department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.companies_validate_default_inbox()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c uuid;
BEGIN
  IF NEW.default_inbox_department_id IS NULL THEN RETURN NEW; END IF;
  SELECT company_id INTO _c FROM public.departments
    WHERE id = NEW.default_inbox_department_id AND deleted_at IS NULL;
  IF _c IS NULL THEN
    RAISE EXCEPTION 'default_inbox_department_id refers to a missing or deleted department';
  END IF;
  IF _c <> NEW.id THEN
    RAISE EXCEPTION 'default_inbox_department_id must belong to the same company';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_companies_validate_default_inbox ON public.companies;
CREATE TRIGGER trg_companies_validate_default_inbox
BEFORE INSERT OR UPDATE OF default_inbox_department_id ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.companies_validate_default_inbox();
