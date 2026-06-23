
CREATE OR REPLACE FUNCTION public.pick_next_round_robin_user(_company_id uuid, _department_id uuid)
 RETURNS TABLE(assigned_user_id uuid, assigned_user_name text, department_id uuid, assignment_mode text, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _dept RECORD;
  _last uuid;
  _chosen uuid;
  _chosen_name text;
BEGIN
  IF NOT (
    public.is_master(auth.uid())
    OR public.user_belongs_to_company(auth.uid(), _company_id)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT d.id, d.company_id, d.assignment_mode, d.round_robin_last_user_id, d.status, d.deleted_at
    INTO _dept
  FROM public.departments d
  WHERE d.id = _department_id
    AND d.company_id = _company_id
    AND d.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, _department_id, NULL::text, 'department_not_found'::text;
    RETURN;
  END IF;

  IF COALESCE(_dept.assignment_mode, 'manual') <> 'round_robin' THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, _dept.id, COALESCE(_dept.assignment_mode,'manual')::text, 'department_not_round_robin'::text;
    RETURN;
  END IF;

  _last := _dept.round_robin_last_user_id;

  WITH eligible AS (
    SELECT du.user_id, p.full_name, du.created_at, du.user_id::text AS uid_text
    FROM public.department_users du
    JOIN public.company_users cu
      ON cu.user_id = du.user_id
     AND cu.company_id = du.company_id
     AND cu.status = 'active'
    JOIN public.profiles p ON p.id = du.user_id
    WHERE du.department_id = _dept.id
      AND du.company_id = _company_id
      AND du.status = 'active'
      AND COALESCE(du.participates_in_rotation, true) = true
  ),
  ordered AS (
    SELECT user_id, full_name, created_at, uid_text,
           row_number() OVER (ORDER BY created_at ASC, uid_text ASC) AS rn,
           count(*) OVER () AS total
    FROM eligible
  ),
  last_pos AS (
    SELECT rn FROM ordered WHERE user_id = _last
  ),
  pick AS (
    SELECT o.user_id, o.full_name
    FROM ordered o
    LEFT JOIN last_pos lp ON true
    ORDER BY
      CASE
        WHEN lp.rn IS NULL THEN o.rn
        ELSE ((o.rn - lp.rn - 1 + o.total) % o.total)
      END
    LIMIT 1
  )
  SELECT user_id, full_name INTO _chosen, _chosen_name FROM pick;

  IF _chosen IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, _dept.id, 'round_robin'::text, 'no_eligible_users'::text;
    RETURN;
  END IF;

  UPDATE public.departments
     SET round_robin_last_user_id = _chosen,
         updated_at = now()
   WHERE id = _dept.id;

  RETURN QUERY SELECT _chosen, _chosen_name, _dept.id, 'round_robin'::text, 'assigned'::text;
END;
$function$;
