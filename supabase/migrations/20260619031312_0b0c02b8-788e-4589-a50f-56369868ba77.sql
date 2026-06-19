ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_edited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS original_body text;