
CREATE TABLE IF NOT EXISTS public.connection_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  connection_id uuid,
  channel text NOT NULL,
  provider text NOT NULL,
  instance_name text,
  identifier text,
  status text NOT NULL DEFAULT 'unknown',
  health text NOT NULL DEFAULT 'unknown',
  last_activity_at timestamptz,
  last_error_at timestamptz,
  error_count integer NOT NULL DEFAULT 0,
  reconnect_count integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'cron',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT ON public.connection_health_snapshots TO authenticated;
GRANT ALL ON public.connection_health_snapshots TO service_role;

CREATE INDEX IF NOT EXISTS idx_connection_health_snapshots_created_at
  ON public.connection_health_snapshots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_connection_health_snapshots_company_created
  ON public.connection_health_snapshots(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_connection_health_snapshots_connection_created
  ON public.connection_health_snapshots(connection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_connection_health_snapshots_provider_health_created
  ON public.connection_health_snapshots(provider, health, created_at DESC);

ALTER TABLE public.connection_health_snapshots ENABLE ROW LEVEL SECURITY;

-- Only Master users can read snapshots; inserts via service_role only.
CREATE POLICY "Master can read connection health snapshots"
  ON public.connection_health_snapshots
  FOR SELECT
  TO authenticated
  USING (public.is_master(auth.uid()));

-- Retention helper (30 days). Safe to call from edge functions.
CREATE OR REPLACE FUNCTION public.connection_health_cleanup()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.connection_health_snapshots
  WHERE created_at < now() - interval '30 days';
$$;

REVOKE ALL ON FUNCTION public.connection_health_cleanup() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.connection_health_cleanup() FROM anon;
REVOKE ALL ON FUNCTION public.connection_health_cleanup() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.connection_health_cleanup() TO service_role;
