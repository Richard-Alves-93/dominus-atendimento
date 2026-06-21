CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON public.message_reactions (message_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_company_id ON public.message_reactions (company_id);
CREATE INDEX IF NOT EXISTS idx_message_favorites_ticket_user ON public.message_favorites (ticket_id, user_id);
CREATE INDEX IF NOT EXISTS idx_pinned_messages_ticket_id ON public.pinned_messages (ticket_id);
CREATE INDEX IF NOT EXISTS idx_messages_company_ticket_created ON public.messages (company_id, ticket_id, created_at DESC);