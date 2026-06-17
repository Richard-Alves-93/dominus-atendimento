
-- 1. Add 'system' to message_type enum (for internal system messages in ticket history)
ALTER TYPE public.message_type ADD VALUE IF NOT EXISTS 'system';

-- 2. scheduled_events
CREATE TABLE IF NOT EXISTS public.scheduled_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  channel_type public.channel_type,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET DEFAULT DEFAULT '00000000-0000-0000-0000-000000000000',
  assigned_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET DEFAULT DEFAULT '00000000-0000-0000-0000-000000000000',
  title text NOT NULL,
  description text,
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  location text,
  meeting_enabled boolean NOT NULL DEFAULT false,
  meeting_url text,
  send_confirmation boolean NOT NULL DEFAULT false,
  reminder_1h_enabled boolean NOT NULL DEFAULT false,
  reminder_5m_enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled','failed')),
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_events TO authenticated;
GRANT ALL ON public.scheduled_events TO service_role;

ALTER TABLE public.scheduled_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS scheduled_events_company_start_idx ON public.scheduled_events(company_id, start_at);
CREATE INDEX IF NOT EXISTS scheduled_events_assigned_idx ON public.scheduled_events(assigned_user_id, start_at);
CREATE INDEX IF NOT EXISTS scheduled_events_ticket_idx ON public.scheduled_events(ticket_id) WHERE ticket_id IS NOT NULL;

CREATE TRIGGER scheduled_events_updated_at
  BEFORE UPDATE ON public.scheduled_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. scheduled_messages (multichannel)
CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  channel_type public.channel_type,
  event_id uuid REFERENCES public.scheduled_events(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('event_confirmation','event_reminder_1h','event_reminder_5m','sales_followup','custom_followup')),
  body text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','cancelled','failed')),
  sent_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_messages TO authenticated;
GRANT ALL ON public.scheduled_messages TO service_role;

ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS scheduled_messages_queue_idx ON public.scheduled_messages(status, scheduled_for) WHERE status IN ('pending','processing');
CREATE INDEX IF NOT EXISTS scheduled_messages_company_idx ON public.scheduled_messages(company_id, scheduled_for);
CREATE INDEX IF NOT EXISTS scheduled_messages_event_idx ON public.scheduled_messages(event_id) WHERE event_id IS NOT NULL;

CREATE TRIGGER scheduled_messages_updated_at
  BEFORE UPDATE ON public.scheduled_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Visibility helper for agenda
CREATE OR REPLACE FUNCTION public.user_can_view_event(
  _user_id uuid,
  _company_id uuid,
  _assigned_user_id uuid,
  _created_by uuid
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- master sees all
    COALESCE((SELECT is_master FROM public.profiles WHERE id = _user_id), false)
    OR
    -- own events
    _assigned_user_id = _user_id
    OR _created_by = _user_id
    OR
    -- owner/admin sees all in company
    EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.user_id = _user_id
        AND cu.company_id = _company_id
        AND cu.status = 'active'
        AND cu.role IN ('owner','admin')
    )
    OR
    -- manager sees events from users in departments they manage
    EXISTS (
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

GRANT EXECUTE ON FUNCTION public.user_can_view_event(uuid,uuid,uuid,uuid) TO authenticated;

-- 5. RLS policies — scheduled_events
CREATE POLICY "scheduled_events_select" ON public.scheduled_events
  FOR SELECT TO authenticated
  USING (
    app_private.user_belongs_to_company(auth.uid(), company_id)
    AND public.user_can_view_event(auth.uid(), company_id, assigned_user_id, created_by)
    OR app_private.is_master(auth.uid())
  );

CREATE POLICY "scheduled_events_insert" ON public.scheduled_events
  FOR INSERT TO authenticated
  WITH CHECK (
    (app_private.user_belongs_to_company(auth.uid(), company_id) AND created_by = auth.uid())
    OR app_private.is_master(auth.uid())
  );

CREATE POLICY "scheduled_events_update" ON public.scheduled_events
  FOR UPDATE TO authenticated
  USING (
    app_private.is_master(auth.uid())
    OR (
      app_private.user_belongs_to_company(auth.uid(), company_id)
      AND public.user_can_view_event(auth.uid(), company_id, assigned_user_id, created_by)
    )
  )
  WITH CHECK (
    app_private.is_master(auth.uid())
    OR app_private.user_belongs_to_company(auth.uid(), company_id)
  );

CREATE POLICY "scheduled_events_delete" ON public.scheduled_events
  FOR DELETE TO authenticated
  USING (
    app_private.is_master(auth.uid())
    OR (
      app_private.user_belongs_to_company(auth.uid(), company_id)
      AND (
        created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.company_users cu
          WHERE cu.user_id = auth.uid() AND cu.company_id = scheduled_events.company_id
            AND cu.status='active' AND cu.role IN ('owner','admin')
        )
      )
    )
  );

-- 6. RLS policies — scheduled_messages (company-scoped, mirrors event visibility via event_id when present)
CREATE POLICY "scheduled_messages_select" ON public.scheduled_messages
  FOR SELECT TO authenticated
  USING (
    app_private.is_master(auth.uid())
    OR app_private.user_belongs_to_company(auth.uid(), company_id)
  );

CREATE POLICY "scheduled_messages_modify" ON public.scheduled_messages
  FOR ALL TO authenticated
  USING (
    app_private.is_master(auth.uid())
    OR app_private.user_belongs_to_company(auth.uid(), company_id)
  )
  WITH CHECK (
    app_private.is_master(auth.uid())
    OR app_private.user_belongs_to_company(auth.uid(), company_id)
  );

-- 7. Cancel helper: when an event is cancelled, cancel its pending scheduled_messages
CREATE OR REPLACE FUNCTION public.cancel_event_scheduled_messages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE public.scheduled_messages
    SET status = 'cancelled', updated_at = now()
    WHERE event_id = NEW.id AND status IN ('pending','processing');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER scheduled_events_cancel_cascade
  AFTER UPDATE ON public.scheduled_events
  FOR EACH ROW EXECUTE FUNCTION public.cancel_event_scheduled_messages();
