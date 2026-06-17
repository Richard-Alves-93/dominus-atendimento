
-- Restore EXECUTE for RLS helper functions in app_private (called by RLS for authenticated users).
-- app_private schema is NOT exposed via PostgREST so this does not appear in the linter.
GRANT EXECUTE ON FUNCTION app_private.is_master(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.user_belongs_to_company(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.user_company_role(uuid, uuid) TO authenticated;

-- Move user_can_view_event to app_private to keep linter clean while still allowing RLS use.
CREATE OR REPLACE FUNCTION app_private.user_can_view_event(
  _user_id uuid, _company_id uuid, _assigned_user_id uuid, _created_by uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, app_private
AS $$
  SELECT
    COALESCE((SELECT is_master FROM public.profiles WHERE id = _user_id), false)
    OR _assigned_user_id = _user_id
    OR _created_by = _user_id
    OR EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.user_id = _user_id AND cu.company_id = _company_id
        AND cu.status = 'active' AND cu.role IN ('owner','admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.department_users du_mgr
      JOIN public.department_users du_member
        ON du_member.department_id = du_mgr.department_id
       AND du_member.status = 'active'
      WHERE du_mgr.user_id = _user_id
        AND du_mgr.company_id = _company_id
        AND du_mgr.status = 'active'
        AND du_mgr.role = 'manager'
        AND du_member.user_id = _assigned_user_id
    )
$$;
REVOKE ALL ON FUNCTION app_private.user_can_view_event(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.user_can_view_event(uuid, uuid, uuid, uuid) TO authenticated;

-- Repoint scheduled_events policies to the app_private variant
DROP POLICY IF EXISTS scheduled_events_select ON public.scheduled_events;
CREATE POLICY scheduled_events_select ON public.scheduled_events
  FOR SELECT TO authenticated
  USING (
    (app_private.user_belongs_to_company(auth.uid(), company_id)
      AND app_private.user_can_view_event(auth.uid(), company_id, assigned_user_id, created_by))
    OR app_private.is_master(auth.uid())
  );

DROP POLICY IF EXISTS scheduled_events_update ON public.scheduled_events;
CREATE POLICY scheduled_events_update ON public.scheduled_events
  FOR UPDATE TO authenticated
  USING (
    app_private.is_master(auth.uid())
    OR (app_private.user_belongs_to_company(auth.uid(), company_id)
        AND app_private.user_can_view_event(auth.uid(), company_id, assigned_user_id, created_by))
  )
  WITH CHECK (
    app_private.is_master(auth.uid()) OR app_private.user_belongs_to_company(auth.uid(), company_id)
  );

-- Drop the now-unused public.user_can_view_event so it doesn't trigger linter 0029
DROP FUNCTION IF EXISTS public.user_can_view_event(uuid, uuid, uuid, uuid);
