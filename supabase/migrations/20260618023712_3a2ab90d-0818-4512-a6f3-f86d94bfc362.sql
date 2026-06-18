
-- 1. reply_to_* columns in messages
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reply_to_provider_message_id text,
  ADD COLUMN IF NOT EXISTS reply_to_preview text,
  ADD COLUMN IF NOT EXISTS reply_to_sender_name text,
  ADD COLUMN IF NOT EXISTS reply_to_message_type text;

CREATE INDEX IF NOT EXISTS idx_messages_reply_to_message_id
  ON public.messages(reply_to_message_id);

-- 2. message_reactions table
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON public.message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_company_id ON public.message_reactions(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_reactions TO authenticated;
GRANT ALL ON public.message_reactions TO service_role;

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reactions_select_company"
  ON public.message_reactions FOR SELECT
  TO authenticated
  USING (
    public.is_master(auth.uid())
    OR public.user_belongs_to_company(auth.uid(), company_id)
  );

CREATE POLICY "reactions_insert_own"
  ON public.message_reactions FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      public.is_master(auth.uid())
      OR public.user_belongs_to_company(auth.uid(), company_id)
    )
  );

CREATE POLICY "reactions_update_own"
  ON public.message_reactions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "reactions_delete_own"
  ON public.message_reactions FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_master(auth.uid())
  );

CREATE TRIGGER trg_message_reactions_updated_at
  BEFORE UPDATE ON public.message_reactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
