CREATE TABLE IF NOT EXISTS public.infrastructure_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'unknown',
  health text NOT NULL DEFAULT 'unknown',
  cpu_percent numeric,
  memory_percent numeric,
  disk_percent numeric,
  load_average numeric,
  uptime_seconds bigint,
  response_time_ms integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT ON public.infrastructure_health_snapshots TO authenticated;
GRANT ALL ON public.infrastructure_health_snapshots TO service_role;

ALTER TABLE public.infrastructure_health_snapshots ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_infra_health_snapshots_created_at
  ON public.infrastructure_health_snapshots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_infra_health_snapshots_health_created
  ON public.infrastructure_health_snapshots(health, created_at DESC);

CREATE POLICY "Master can read infra snapshots"
  ON public.infrastructure_health_snapshots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.is_master = true OR p.global_role = 'master')
    )
  );
