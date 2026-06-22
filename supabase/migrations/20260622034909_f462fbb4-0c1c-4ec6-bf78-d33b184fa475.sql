-- 1) Tabela de snapshots de fluxo por conexão
CREATE TABLE IF NOT EXISTS public.connection_message_flow_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  connection_id uuid,
  channel_id uuid,
  channel text NOT NULL,
  provider text NOT NULL,
  instance_name text,
  identifier text,
  inbound_count_24h integer NOT NULL DEFAULT 0,
  outbound_count_24h integer NOT NULL DEFAULT 0,
  failed_count_24h integer NOT NULL DEFAULT 0,
  pending_count_24h integer NOT NULL DEFAULT 0,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_webhook_at timestamptz,
  health text NOT NULL DEFAULT 'unknown',
  source text NOT NULL DEFAULT 'cron',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- 2) Grants
GRANT SELECT ON public.connection_message_flow_snapshots TO authenticated;
GRANT ALL ON public.connection_message_flow_snapshots TO service_role;

-- 3) RLS
ALTER TABLE public.connection_message_flow_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "master_select_connection_message_flow_snapshots"
  ON public.connection_message_flow_snapshots
  FOR SELECT
  TO authenticated
  USING (public.is_master(auth.uid()));

-- 4) Índices
CREATE INDEX IF NOT EXISTS idx_cmfs_created_at
  ON public.connection_message_flow_snapshots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cmfs_company_created
  ON public.connection_message_flow_snapshots(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cmfs_connection_created
  ON public.connection_message_flow_snapshots(connection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cmfs_channel_created
  ON public.connection_message_flow_snapshots(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cmfs_provider_created
  ON public.connection_message_flow_snapshots(provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cmfs_health_created
  ON public.connection_message_flow_snapshots(health, created_at DESC);

-- 5) Função de limpeza (retenção 30 dias)
CREATE OR REPLACE FUNCTION public.connection_message_flow_cleanup()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.connection_message_flow_snapshots
  WHERE created_at < now() - interval '30 days';
$$;

REVOKE ALL ON FUNCTION public.connection_message_flow_cleanup() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.connection_message_flow_cleanup() FROM anon;
REVOKE ALL ON FUNCTION public.connection_message_flow_cleanup() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.connection_message_flow_cleanup() TO service_role;

-- 6) Índices auxiliares em messages (para manter a agregação leve)
CREATE INDEX IF NOT EXISTS idx_messages_company_created
  ON public.messages(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_company_direction_created
  ON public.messages(company_id, direction, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_company_status_created
  ON public.messages(company_id, status, created_at DESC);
