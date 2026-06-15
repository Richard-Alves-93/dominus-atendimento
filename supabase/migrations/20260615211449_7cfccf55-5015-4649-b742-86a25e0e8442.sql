
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media_mime_type text,
  ADD COLUMN IF NOT EXISTS media_file_name text,
  ADD COLUMN IF NOT EXISTS media_size bigint,
  ADD COLUMN IF NOT EXISTS media_duration integer,
  ADD COLUMN IF NOT EXISTS media_caption text,
  ADD COLUMN IF NOT EXISTS media_storage_path text,
  ADD COLUMN IF NOT EXISTS media_provider_id text;

CREATE INDEX IF NOT EXISTS messages_media_storage_path_idx
  ON public.messages (media_storage_path)
  WHERE media_storage_path IS NOT NULL;
