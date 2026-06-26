
ALTER TABLE public.kanban_lanes
  ADD COLUMN IF NOT EXISTS operational_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS transfer_ticket_on_drop boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS return_if_unassigned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS return_timeout_minutes integer,
  ADD COLUMN IF NOT EXISTS return_target text;

-- Validação dos campos operacionais
CREATE OR REPLACE FUNCTION public.kanban_lanes_validate_operational()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.operational_enabled = true THEN
    IF NEW.lane_type <> 'department' THEN
      RAISE EXCEPTION 'operational rules can only be enabled on department lanes';
    END IF;
    IF NEW.department_id IS NULL THEN
      RAISE EXCEPTION 'department_id is required when operational rules are enabled';
    END IF;
  ELSE
    -- regras operacionais desligadas: zera dependentes
    NEW.transfer_ticket_on_drop := false;
    NEW.return_if_unassigned := false;
    NEW.return_timeout_minutes := NULL;
    NEW.return_target := NULL;
  END IF;

  IF NEW.return_if_unassigned = true THEN
    IF NEW.return_timeout_minutes IS NULL OR NEW.return_timeout_minutes <= 0 THEN
      RAISE EXCEPTION 'return_timeout_minutes must be positive when return_if_unassigned is true';
    END IF;
    IF NEW.return_target IS NULL OR NEW.return_target NOT IN ('previous_user','origin_department') THEN
      RAISE EXCEPTION 'return_target must be previous_user or origin_department when return_if_unassigned is true';
    END IF;
  ELSE
    NEW.return_timeout_minutes := NULL;
    NEW.return_target := NULL;
  END IF;

  -- Linhas pessoais/comerciais/personalizadas não podem ter regras operacionais
  IF NEW.lane_type IN ('personal','commercial','custom') THEN
    NEW.operational_enabled := false;
    NEW.transfer_ticket_on_drop := false;
    NEW.return_if_unassigned := false;
    NEW.return_timeout_minutes := NULL;
    NEW.return_target := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kanban_lanes_validate_operational_trg ON public.kanban_lanes;
CREATE TRIGGER kanban_lanes_validate_operational_trg
BEFORE INSERT OR UPDATE ON public.kanban_lanes
FOR EACH ROW EXECUTE FUNCTION public.kanban_lanes_validate_operational();

-- Auditoria das alterações operacionais
CREATE OR REPLACE FUNCTION public.kanban_lanes_audit_operational()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _changed boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.operational_enabled IS DISTINCT FROM OLD.operational_enabled
       OR NEW.transfer_ticket_on_drop IS DISTINCT FROM OLD.transfer_ticket_on_drop
       OR NEW.return_if_unassigned IS DISTINCT FROM OLD.return_if_unassigned
       OR NEW.return_timeout_minutes IS DISTINCT FROM OLD.return_timeout_minutes
       OR NEW.return_target IS DISTINCT FROM OLD.return_target THEN
      _changed := true;
    END IF;
  ELSIF TG_OP = 'INSERT' AND NEW.operational_enabled = true THEN
    _changed := true;
  END IF;

  IF _changed THEN
    INSERT INTO public.audit_logs (company_id, event_type, changed_by, metadata)
    VALUES (
      NEW.company_id,
      'kanban.lane_operational_rules_changed',
      auth.uid(),
      jsonb_build_object(
        'lane_id', NEW.id,
        'department_id', NEW.department_id,
        'old_values', CASE WHEN TG_OP='UPDATE' THEN jsonb_build_object(
          'operational_enabled', OLD.operational_enabled,
          'transfer_ticket_on_drop', OLD.transfer_ticket_on_drop,
          'return_if_unassigned', OLD.return_if_unassigned,
          'return_timeout_minutes', OLD.return_timeout_minutes,
          'return_target', OLD.return_target
        ) ELSE NULL END,
        'new_values', jsonb_build_object(
          'operational_enabled', NEW.operational_enabled,
          'transfer_ticket_on_drop', NEW.transfer_ticket_on_drop,
          'return_if_unassigned', NEW.return_if_unassigned,
          'return_timeout_minutes', NEW.return_timeout_minutes,
          'return_target', NEW.return_target
        ),
        'source', 'kanban_lane_settings'
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kanban_lanes_audit_operational_trg ON public.kanban_lanes;
CREATE TRIGGER kanban_lanes_audit_operational_trg
AFTER INSERT OR UPDATE ON public.kanban_lanes
FOR EACH ROW EXECUTE FUNCTION public.kanban_lanes_audit_operational();
