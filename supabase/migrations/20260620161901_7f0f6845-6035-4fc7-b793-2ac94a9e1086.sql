ALTER TABLE public.message_reactions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.message_reactions ADD COLUMN IF NOT EXISTS external_sender text;
ALTER TABLE public.message_reactions ADD COLUMN IF NOT EXISTS external_reaction_id text;
ALTER TABLE public.message_reactions ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'agent';
ALTER TABLE public.message_reactions DROP CONSTRAINT IF EXISTS message_reactions_message_id_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_reactions_msg_user ON public.message_reactions(message_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_reactions_msg_external_sender ON public.message_reactions(message_id, external_sender) WHERE external_sender IS NOT NULL;
ALTER TABLE public.message_reactions DROP CONSTRAINT IF EXISTS message_reactions_author_chk;
ALTER TABLE public.message_reactions ADD CONSTRAINT message_reactions_author_chk CHECK ((user_id IS NOT NULL) <> (external_sender IS NOT NULL));