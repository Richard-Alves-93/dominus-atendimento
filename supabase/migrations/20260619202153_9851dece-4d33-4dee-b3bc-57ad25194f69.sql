CREATE TABLE public.pinned_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_pinned_tickets_user_company ON public.pinned_tickets(user_id, company_id);
CREATE INDEX IF NOT EXISTS idx_pinned_tickets_ticket ON public.pinned_tickets(ticket_id);

GRANT SELECT, INSERT, DELETE ON public.pinned_tickets TO authenticated;
GRANT ALL ON public.pinned_tickets TO service_role;

ALTER TABLE public.pinned_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pinned_tickets_select_own"
  ON public.pinned_tickets
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    AND public.user_belongs_to_company(auth.uid(), company_id)
  );

CREATE POLICY "pinned_tickets_insert_own"
  ON public.pinned_tickets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.user_belongs_to_company(auth.uid(), company_id)
  );

CREATE POLICY "pinned_tickets_delete_own"
  ON public.pinned_tickets
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND public.user_belongs_to_company(auth.uid(), company_id)
  );