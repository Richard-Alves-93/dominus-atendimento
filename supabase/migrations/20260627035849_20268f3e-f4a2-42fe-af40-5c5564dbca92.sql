CREATE UNIQUE INDEX IF NOT EXISTS kanban_lanes_unique_active_department
  ON public.kanban_lanes(company_id, department_id)
  WHERE lane_type = 'department' AND deleted_at IS NULL AND department_id IS NOT NULL;