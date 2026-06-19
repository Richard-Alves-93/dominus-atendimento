CREATE TABLE public.message_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_message_favorites_user_company ON public.message_favorites(user_id, company_id);
CREATE INDEX IF NOT EXISTS idx_message_favorites_ticket ON public.message_favorites(ticket_id);
CREATE INDEX IF NOT EXISTS idx_message_favorites_message ON public.message_favorites(message_id);

GRANT SELECT, INSERT, DELETE ON public.message_favorites TO authenticated;
GRANT ALL ON public.message_favorites TO service_role;

ALTER TABLE public.message_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "favorites_select_own"
  ON public.message_favorites
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND public.user_belongs_to_company(auth.uid(), company_id)
  );

CREATE POLICY "favorites_insert_own"
  ON public.message_favorites
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.user_belongs_to_company(auth.uid(), company_id)
  );

CREATE POLICY "favorites_delete_own"
  ON public.message_favorites
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
