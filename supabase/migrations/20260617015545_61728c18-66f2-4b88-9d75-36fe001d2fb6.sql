-- Helper: detect schedule conflict for a given user
CREATE OR REPLACE FUNCTION public.has_schedule_conflict(
  p_company_id uuid,
  p_assigned_user_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_ignore_event_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.scheduled_events e
    WHERE e.company_id = p_company_id
      AND e.assigned_user_id = p_assigned_user_id
      AND e.status NOT IN ('cancelled','completed','failed','no_show','no_response')
      AND (p_ignore_event_id IS NULL OR e.id <> p_ignore_event_id)
      AND e.start_at < COALESCE(p_end_at, p_start_at + interval '30 minutes')
      AND COALESCE(e.end_at, e.start_at + interval '30 minutes') > p_start_at
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_schedule_conflict(uuid, uuid, timestamptz, timestamptz, uuid) TO authenticated, service_role;

-- Trigger to block conflicts on INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.scheduled_events_block_conflict()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only enforce when event is active
  IF NEW.status IN ('cancelled','completed','failed','no_show','no_response') THEN
    RETURN NEW;
  END IF;
  IF NEW.assigned_user_id IS NULL OR NEW.start_at IS NULL THEN
    RETURN NEW;
  END IF;
  -- Skip when nothing relevant changed (UPDATE)
  IF TG_OP = 'UPDATE'
     AND NEW.assigned_user_id IS NOT DISTINCT FROM OLD.assigned_user_id
     AND NEW.start_at IS NOT DISTINCT FROM OLD.start_at
     AND NEW.end_at IS NOT DISTINCT FROM OLD.end_at
     AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF public.has_schedule_conflict(
       NEW.company_id, NEW.assigned_user_id, NEW.start_at, NEW.end_at, NEW.id
     ) THEN
    RAISE EXCEPTION 'SCHEDULE_CONFLICT'
      USING HINT = 'Este responsável já possui um agendamento nesse horário.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scheduled_events_block_conflict ON public.scheduled_events;
CREATE TRIGGER trg_scheduled_events_block_conflict
BEFORE INSERT OR UPDATE ON public.scheduled_events
FOR EACH ROW EXECUTE FUNCTION public.scheduled_events_block_conflict();