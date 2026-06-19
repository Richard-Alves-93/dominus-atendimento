CREATE TABLE public.pinned_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  pinned_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_pinned_messages_company_ticket ON public.pinned_messages(company_id, ticket_id);
CREATE INDEX IF NOT EXISTS idx_pinned_messages_message ON public.pinned_messages(message_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinned_messages TO authenticated;
GRANT ALL ON public.pinned_messages TO service_role;

ALTER TABLE public.pinned_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pinned_messages_select_company"
  ON public.pinned_messages FOR SELECT
  TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "pinned_messages_insert_company"
  ON public.pinned_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND pinned_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id AND t.company_id = pinned_messages.company_id)
    AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND m.company_id = pinned_messages.company_id AND m.ticket_id = pinned_messages.ticket_id)
  );

CREATE POLICY "pinned_messages_update_company"
  ON public.pinned_messages FOR UPDATE
  TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id AND t.company_id = pinned_messages.company_id)
    AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND m.company_id = pinned_messages.company_id AND m.ticket_id = pinned_messages.ticket_id)
  );

CREATE POLICY "pinned_messages_delete_company"
  ON public.pinned_messages FOR DELETE
  TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));
