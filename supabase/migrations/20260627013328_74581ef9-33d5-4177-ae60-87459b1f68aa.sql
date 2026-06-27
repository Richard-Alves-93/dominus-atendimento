
REVOKE EXECUTE ON FUNCTION public._k10_can_manage_company(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public._k10_check_lane_access(uuid, uuid, public.kanban_lanes) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reorder_kanban_lane(uuid, uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reorder_kanban_column(uuid, uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reorder_kanban_card(uuid, uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.update_kanban_manual_card(uuid, uuid, text, text, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.archive_kanban_card(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.archive_kanban_column(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.archive_kanban_lane(uuid, uuid) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.reorder_kanban_lane(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_kanban_column(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_kanban_card(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_kanban_manual_card(uuid, uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_kanban_card(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_kanban_column(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_kanban_lane(uuid, uuid) TO authenticated;
