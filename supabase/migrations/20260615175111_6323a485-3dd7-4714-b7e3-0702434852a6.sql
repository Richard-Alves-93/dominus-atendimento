ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'dominus';
CREATE INDEX IF NOT EXISTS idx_messages_source ON public.messages(source);