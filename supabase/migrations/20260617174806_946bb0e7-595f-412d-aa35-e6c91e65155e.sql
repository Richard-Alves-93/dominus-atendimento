
-- 1. Protocol settings on company_settings
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS protocol_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS protocol_prefix text,
  ADD COLUMN IF NOT EXISTS protocol_format text NOT NULL DEFAULT '{PREFIX}-{YYYY}-{SEQUENCE_6}';

-- 2. Protocol number on tickets, unique per company
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS protocol_number text;

CREATE UNIQUE INDEX IF NOT EXISTS tickets_company_protocol_unique
  ON public.tickets (company_id, protocol_number)
  WHERE protocol_number IS NOT NULL;

-- 3. Sequence table per company per year (atomic counter)
CREATE TABLE IF NOT EXISTS public.ticket_protocol_sequences (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  year integer NOT NULL,
  current_value bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, year)
);

-- Locked down: only service_role / SECURITY DEFINER fn touches it
GRANT ALL ON public.ticket_protocol_sequences TO service_role;
ALTER TABLE public.ticket_protocol_sequences ENABLE ROW LEVEL SECURITY;
-- No policies for authenticated/anon: not directly readable from client.

-- 4. SECURITY DEFINER function to generate next protocol for a company.
CREATE OR REPLACE FUNCTION public.generate_ticket_protocol(_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _enabled boolean;
  _prefix text;
  _format text;
  _year int := EXTRACT(YEAR FROM now() AT TIME ZONE 'America/Sao_Paulo')::int;
  _next bigint;
  _result text;
BEGIN
  SELECT protocol_enabled,
         COALESCE(NULLIF(TRIM(protocol_prefix), ''), 'ATD'),
         COALESCE(NULLIF(TRIM(protocol_format), ''), '{PREFIX}-{YYYY}-{SEQUENCE_6}')
    INTO _enabled, _prefix, _format
  FROM public.company_settings
  WHERE company_id = _company_id;

  IF _enabled IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  -- Atomic upsert + increment
  INSERT INTO public.ticket_protocol_sequences (company_id, year, current_value, updated_at)
  VALUES (_company_id, _year, 1, now())
  ON CONFLICT (company_id, year)
  DO UPDATE SET current_value = ticket_protocol_sequences.current_value + 1,
                updated_at = now()
  RETURNING current_value INTO _next;

  _result := _format;
  _result := REPLACE(_result, '{PREFIX}', _prefix);
  _result := REPLACE(_result, '{YYYY}', _year::text);
  _result := REPLACE(_result, '{SEQUENCE_6}', LPAD(_next::text, 6, '0'));
  _result := REPLACE(_result, '{SEQUENCE}', _next::text);

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_ticket_protocol(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_ticket_protocol(uuid) FROM anon;
-- Not callable directly from clients; trigger uses it under SECURITY DEFINER context.

-- 5. BEFORE INSERT trigger on tickets to auto-assign protocol when enabled
CREATE OR REPLACE FUNCTION public.tickets_assign_protocol()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.protocol_number IS NULL THEN
    NEW.protocol_number := public.generate_ticket_protocol(NEW.company_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tickets_assign_protocol ON public.tickets;
CREATE TRIGGER trg_tickets_assign_protocol
  BEFORE INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.tickets_assign_protocol();
