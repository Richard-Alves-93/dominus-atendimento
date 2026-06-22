
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS assignment_mode text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS round_robin_last_user_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_assignment_mode_check') THEN
    ALTER TABLE public.departments ADD CONSTRAINT departments_assignment_mode_check
      CHECK (assignment_mode IN ('manual','round_robin'));
  END IF;
END $$;

ALTER TABLE public.department_users
  ADD COLUMN IF NOT EXISTS participates_in_rotation boolean NOT NULL DEFAULT true;
