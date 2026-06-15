
-- Sync existing phone to channels
UPDATE public.channels c
SET phone_number = w.phone_number
FROM public.whatsapp_instances w
WHERE w.channel_id = c.id AND w.phone_number IS NOT NULL AND c.phone_number IS NULL;

-- ============ contacts ============
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text,
  phone_number text,
  email text,
  avatar_url text,
  external_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, phone_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts_select" ON public.contacts FOR SELECT TO authenticated
  USING (app_private.is_master(auth.uid()) OR app_private.user_belongs_to_company(auth.uid(), company_id));
CREATE POLICY "contacts_modify" ON public.contacts FOR ALL TO authenticated
  USING (app_private.is_master(auth.uid()) OR app_private.user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (app_private.is_master(auth.uid()) OR app_private.user_belongs_to_company(auth.uid(), company_id));
CREATE TRIGGER trg_contacts_updated_at BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX contacts_company_phone_idx ON public.contacts(company_id, phone_number);

-- ============ tickets ============
CREATE TYPE public.ticket_status AS ENUM ('open','pending','closed');
CREATE TABLE public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.ticket_status NOT NULL DEFAULT 'open',
  subject text,
  last_message_at timestamptz,
  unread_count int NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tickets_select" ON public.tickets FOR SELECT TO authenticated
  USING (app_private.is_master(auth.uid()) OR app_private.user_belongs_to_company(auth.uid(), company_id));
CREATE POLICY "tickets_modify" ON public.tickets FOR ALL TO authenticated
  USING (app_private.is_master(auth.uid()) OR app_private.user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (app_private.is_master(auth.uid()) OR app_private.user_belongs_to_company(auth.uid(), company_id));
CREATE TRIGGER trg_tickets_updated_at BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX tickets_company_status_idx ON public.tickets(company_id, status, last_message_at DESC);
CREATE INDEX tickets_contact_idx ON public.tickets(contact_id);

-- ============ messages ============
CREATE TYPE public.message_direction AS ENUM ('inbound','outbound');
CREATE TYPE public.message_type AS ENUM ('text','image','audio','video','document','sticker','location','contact','other');
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  direction public.message_direction NOT NULL,
  msg_type public.message_type NOT NULL DEFAULT 'text',
  body text,
  media_url text,
  external_id text,
  from_me boolean NOT NULL DEFAULT false,
  status text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, external_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_select" ON public.messages FOR SELECT TO authenticated
  USING (app_private.is_master(auth.uid()) OR app_private.user_belongs_to_company(auth.uid(), company_id));
CREATE POLICY "messages_modify" ON public.messages FOR ALL TO authenticated
  USING (app_private.is_master(auth.uid()) OR app_private.user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (app_private.is_master(auth.uid()) OR app_private.user_belongs_to_company(auth.uid(), company_id));
CREATE INDEX messages_ticket_idx ON public.messages(ticket_id, sent_at DESC);
CREATE INDEX messages_company_idx ON public.messages(company_id, sent_at DESC);
