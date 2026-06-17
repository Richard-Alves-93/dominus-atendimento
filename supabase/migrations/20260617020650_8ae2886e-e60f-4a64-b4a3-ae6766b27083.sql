
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND COALESCE(is_master, false) = false
    AND COALESCE(global_role, 'user'::global_role) = 'user'::global_role
  );

DROP TRIGGER IF EXISTS trg_profiles_prevent_priv_escalation ON public.profiles;
CREATE TRIGGER trg_profiles_prevent_priv_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

REVOKE ALL ON FUNCTION public.is_master(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.user_belongs_to_company(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.user_company_role(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.user_can_view_event(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.scheduled_events_block_conflict() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_event_scheduled_messages() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION app_private.is_master(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.user_belongs_to_company(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.user_company_role(uuid, uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.has_schedule_conflict(uuid, uuid, timestamptz, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_schedule_conflict(uuid, uuid, timestamptz, timestamptz, uuid) TO authenticated;
