
-- Enums
DO $$ BEGIN
  CREATE TYPE public.kanban_lane_type AS ENUM ('department','commercial','personal','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.kanban_card_type AS ENUM ('manual','ticket','contact','opportunity','task');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- kanban_lanes
CREATE TABLE IF NOT EXISTS public.kanban_lanes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  lane_type public.kanban_lane_type NOT NULL DEFAULT 'custom',
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  is_personal boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_kanban_lanes_company ON public.kanban_lanes(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_kanban_lanes_owner ON public.kanban_lanes(owner_user_id) WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kanban_lanes TO authenticated;
GRANT ALL ON public.kanban_lanes TO service_role;
ALTER TABLE public.kanban_lanes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kanban_lanes_select" ON public.kanban_lanes FOR SELECT TO authenticated
USING (
  deleted_at IS NULL AND (
    public.is_master(auth.uid())
    OR (
      public.user_belongs_to_company(auth.uid(), company_id)
      AND (is_personal = false OR owner_user_id = auth.uid()
           OR public.user_company_role(auth.uid(), company_id) IN ('owner','admin'))
    )
  )
);

CREATE POLICY "kanban_lanes_insert" ON public.kanban_lanes FOR INSERT TO authenticated
WITH CHECK (
  public.user_belongs_to_company(auth.uid(), company_id)
  AND created_by = auth.uid()
  AND (
    is_personal = true AND owner_user_id = auth.uid()
    OR public.user_company_role(auth.uid(), company_id) IN ('owner','admin','manager')
  )
);

CREATE POLICY "kanban_lanes_update" ON public.kanban_lanes FOR UPDATE TO authenticated
USING (
  public.is_master(auth.uid())
  OR (is_personal = true AND owner_user_id = auth.uid())
  OR public.user_company_role(auth.uid(), company_id) IN ('owner','admin')
)
WITH CHECK (
  public.is_master(auth.uid())
  OR (is_personal = true AND owner_user_id = auth.uid())
  OR public.user_company_role(auth.uid(), company_id) IN ('owner','admin')
);

CREATE POLICY "kanban_lanes_delete" ON public.kanban_lanes FOR DELETE TO authenticated
USING (
  public.is_master(auth.uid())
  OR (is_personal = true AND owner_user_id = auth.uid())
  OR public.user_company_role(auth.uid(), company_id) IN ('owner','admin')
);

CREATE TRIGGER trg_kanban_lanes_updated_at BEFORE UPDATE ON public.kanban_lanes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- kanban_columns
CREATE TABLE IF NOT EXISTS public.kanban_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lane_id uuid NOT NULL REFERENCES public.kanban_lanes(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  color text,
  column_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_kanban_columns_lane ON public.kanban_columns(lane_id) WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kanban_columns TO authenticated;
GRANT ALL ON public.kanban_columns TO service_role;
ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kanban_columns_select" ON public.kanban_columns FOR SELECT TO authenticated
USING (
  deleted_at IS NULL AND EXISTS (
    SELECT 1 FROM public.kanban_lanes l
    WHERE l.id = lane_id AND l.deleted_at IS NULL
      AND (
        public.is_master(auth.uid())
        OR (
          public.user_belongs_to_company(auth.uid(), l.company_id)
          AND (l.is_personal = false OR l.owner_user_id = auth.uid()
               OR public.user_company_role(auth.uid(), l.company_id) IN ('owner','admin'))
        )
      )
  )
);

CREATE POLICY "kanban_columns_modify" ON public.kanban_columns FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.kanban_lanes l
    WHERE l.id = lane_id AND l.company_id = kanban_columns.company_id
      AND (
        public.is_master(auth.uid())
        OR (l.is_personal = true AND l.owner_user_id = auth.uid())
        OR public.user_company_role(auth.uid(), l.company_id) IN ('owner','admin','manager')
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.kanban_lanes l
    WHERE l.id = lane_id AND l.company_id = kanban_columns.company_id
      AND (
        public.is_master(auth.uid())
        OR (l.is_personal = true AND l.owner_user_id = auth.uid())
        OR public.user_company_role(auth.uid(), l.company_id) IN ('owner','admin','manager')
      )
  )
);

CREATE TRIGGER trg_kanban_columns_updated_at BEFORE UPDATE ON public.kanban_columns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- kanban_cards
CREATE TABLE IF NOT EXISTS public.kanban_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lane_id uuid NOT NULL REFERENCES public.kanban_lanes(id) ON DELETE CASCADE,
  column_id uuid NOT NULL REFERENCES public.kanban_columns(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  card_type public.kanban_card_type NOT NULL DEFAULT 'manual',
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  task_id uuid,
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  position integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_kanban_cards_column ON public.kanban_cards(column_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_kanban_cards_lane ON public.kanban_cards(lane_id) WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kanban_cards TO authenticated;
GRANT ALL ON public.kanban_cards TO service_role;
ALTER TABLE public.kanban_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kanban_cards_select" ON public.kanban_cards FOR SELECT TO authenticated
USING (
  deleted_at IS NULL AND EXISTS (
    SELECT 1 FROM public.kanban_lanes l
    WHERE l.id = lane_id AND l.deleted_at IS NULL
      AND (
        public.is_master(auth.uid())
        OR (
          public.user_belongs_to_company(auth.uid(), l.company_id)
          AND (l.is_personal = false OR l.owner_user_id = auth.uid()
               OR public.user_company_role(auth.uid(), l.company_id) IN ('owner','admin'))
        )
      )
  )
);

CREATE POLICY "kanban_cards_modify" ON public.kanban_cards FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.kanban_lanes l
    WHERE l.id = lane_id AND l.company_id = kanban_cards.company_id
      AND (
        public.is_master(auth.uid())
        OR (l.is_personal = true AND l.owner_user_id = auth.uid())
        OR public.user_company_role(auth.uid(), l.company_id) IN ('owner','admin','manager','agent')
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.kanban_lanes l
    WHERE l.id = lane_id AND l.company_id = kanban_cards.company_id
      AND (
        public.is_master(auth.uid())
        OR (l.is_personal = true AND l.owner_user_id = auth.uid())
        OR public.user_company_role(auth.uid(), l.company_id) IN ('owner','admin','manager','agent')
      )
  )
);

CREATE TRIGGER trg_kanban_cards_updated_at BEFORE UPDATE ON public.kanban_cards
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
