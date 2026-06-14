
-- ENUMS
CREATE TYPE public.company_status AS ENUM ('trial','active','pending','suspended','canceled');
CREATE TYPE public.company_user_role AS ENUM ('owner','admin','manager','agent','financial');
CREATE TYPE public.company_user_status AS ENUM ('active','pending','disabled');
CREATE TYPE public.channel_type AS ENUM ('whatsapp','instagram','facebook','email');
CREATE TYPE public.channel_provider AS ENUM ('evolution','evogo','meta','imap_smtp','manual');
CREATE TYPE public.channel_status AS ENUM ('disconnected','pending','connected','error','disabled');
CREATE TYPE public.global_role AS ENUM ('master','user');

-- updated_at trigger fn
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ========== TABLES (no policies yet) ==========
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT, email TEXT, phone TEXT, avatar_url TEXT,
  is_master BOOLEAN NOT NULL DEFAULT false,
  global_role public.global_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, email TEXT, phone TEXT, document TEXT,
  status public.company_status NOT NULL DEFAULT 'trial',
  plan_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;

CREATE TABLE public.company_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.company_user_role NOT NULL DEFAULT 'agent',
  status public.company_user_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_users TO authenticated;
GRANT ALL ON public.company_users TO service_role;

CREATE TABLE public.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel_type public.channel_type NOT NULL,
  channel_provider public.channel_provider NOT NULL DEFAULT 'manual',
  name TEXT NOT NULL,
  status public.channel_status NOT NULL DEFAULT 'disconnected',
  external_id TEXT, phone_number TEXT, email_address TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channels TO authenticated;
GRANT ALL ON public.channels TO service_role;

CREATE TABLE public.whatsapp_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL, phone_number TEXT,
  status public.channel_status NOT NULL DEFAULT 'disconnected',
  qr_code TEXT, connected_at TIMESTAMPTZ, disconnected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_instances TO authenticated;
GRANT ALL ON public.whatsapp_instances TO service_role;

CREATE TABLE public.channel_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, status TEXT, message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.channel_sync_logs TO authenticated;
GRANT ALL ON public.channel_sync_logs TO service_role;

-- ========== updated_at triggers ==========
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_company_users_updated_at BEFORE UPDATE ON public.company_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_channels_updated_at BEFORE UPDATE ON public.channels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_whatsapp_instances_updated_at BEFORE UPDATE ON public.whatsapp_instances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== SECURITY DEFINER FUNCTIONS (tables exist now) ==========
CREATE OR REPLACE FUNCTION public.is_master(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_master FROM public.profiles WHERE id = _user_id), false);
$$;

CREATE OR REPLACE FUNCTION public.user_belongs_to_company(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_users
    WHERE user_id = _user_id AND company_id = _company_id AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.user_company_role(_user_id UUID, _company_id UUID)
RETURNS public.company_user_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.company_users
  WHERE user_id = _user_id AND company_id = _company_id AND status = 'active' LIMIT 1;
$$;

-- ========== ENABLE RLS ==========
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_sync_logs ENABLE ROW LEVEL SECURITY;

-- ========== POLICIES ==========
CREATE POLICY "profiles_select_own_or_master" ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR public.is_master(auth.uid()));
CREATE POLICY "profiles_update_own_or_master" ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid() OR public.is_master(auth.uid()))
WITH CHECK (id = auth.uid() OR public.is_master(auth.uid()));
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated
WITH CHECK (id = auth.uid());

CREATE POLICY "companies_select_member_or_master" ON public.companies FOR SELECT TO authenticated
USING (public.is_master(auth.uid()) OR public.user_belongs_to_company(auth.uid(), id));
CREATE POLICY "companies_update_admin_or_master" ON public.companies FOR UPDATE TO authenticated
USING (public.is_master(auth.uid()) OR public.user_company_role(auth.uid(), id) IN ('owner','admin'))
WITH CHECK (public.is_master(auth.uid()) OR public.user_company_role(auth.uid(), id) IN ('owner','admin'));
CREATE POLICY "companies_insert_master" ON public.companies FOR INSERT TO authenticated
WITH CHECK (public.is_master(auth.uid()));
CREATE POLICY "companies_delete_master" ON public.companies FOR DELETE TO authenticated
USING (public.is_master(auth.uid()));

CREATE POLICY "company_users_select_self_or_master" ON public.company_users FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_master(auth.uid())
  OR public.user_company_role(auth.uid(), company_id) IN ('owner','admin')
);
CREATE POLICY "company_users_modify_owner_or_master" ON public.company_users FOR ALL TO authenticated
USING (public.is_master(auth.uid()) OR public.user_company_role(auth.uid(), company_id) = 'owner')
WITH CHECK (public.is_master(auth.uid()) OR public.user_company_role(auth.uid(), company_id) = 'owner');

CREATE POLICY "channels_select_member_or_master" ON public.channels FOR SELECT TO authenticated
USING (public.is_master(auth.uid()) OR public.user_belongs_to_company(auth.uid(), company_id));
CREATE POLICY "channels_modify_admin_or_master" ON public.channels FOR ALL TO authenticated
USING (public.is_master(auth.uid()) OR public.user_company_role(auth.uid(), company_id) IN ('owner','admin','manager'))
WITH CHECK (public.is_master(auth.uid()) OR public.user_company_role(auth.uid(), company_id) IN ('owner','admin','manager'));

CREATE POLICY "wa_instances_select_member_or_master" ON public.whatsapp_instances FOR SELECT TO authenticated
USING (public.is_master(auth.uid()) OR public.user_belongs_to_company(auth.uid(), company_id));
CREATE POLICY "wa_instances_modify_admin_or_master" ON public.whatsapp_instances FOR ALL TO authenticated
USING (public.is_master(auth.uid()) OR public.user_company_role(auth.uid(), company_id) IN ('owner','admin','manager'))
WITH CHECK (public.is_master(auth.uid()) OR public.user_company_role(auth.uid(), company_id) IN ('owner','admin','manager'));

CREATE POLICY "sync_logs_select_member_or_master" ON public.channel_sync_logs FOR SELECT TO authenticated
USING (public.is_master(auth.uid()) OR public.user_belongs_to_company(auth.uid(), company_id));
CREATE POLICY "sync_logs_insert_member_or_master" ON public.channel_sync_logs FOR INSERT TO authenticated
WITH CHECK (public.is_master(auth.uid()) OR public.user_belongs_to_company(auth.uid(), company_id));

-- ========== HANDLE NEW USER ==========
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone)
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
