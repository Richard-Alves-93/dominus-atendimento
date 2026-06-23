-- R.4.3: setor padrão por conexão/canal
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS default_department_id uuid NULL
  REFERENCES public.departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_channels_default_department_id
  ON public.channels(default_department_id);

-- Cross-company guard: ensure default_department_id belongs to the same company
CREATE OR REPLACE FUNCTION public.channels_validate_default_department()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _dept_company uuid;
BEGIN
  IF NEW.default_department_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT company_id INTO _dept_company
  FROM public.departments
  WHERE id = NEW.default_department_id AND deleted_at IS NULL;
  IF _dept_company IS NULL THEN
    RAISE EXCEPTION 'default_department_id refers to a missing or deleted department';
  END IF;
  IF _dept_company <> NEW.company_id THEN
    RAISE EXCEPTION 'default_department_id must belong to the same company as the channel';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_channels_validate_default_department ON public.channels;
CREATE TRIGGER trg_channels_validate_default_department
BEFORE INSERT OR UPDATE OF default_department_id, company_id
ON public.channels
FOR EACH ROW EXECUTE FUNCTION public.channels_validate_default_department();