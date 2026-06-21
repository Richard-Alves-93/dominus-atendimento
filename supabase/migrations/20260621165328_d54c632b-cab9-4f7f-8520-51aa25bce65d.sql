CREATE TABLE public.evolution_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  api_online boolean NOT NULL DEFAULT false,
  health text NOT NULL DEFAULT 'unknown',
  response_time_ms integer,
  total_instances integer NOT NULL DEFAULT 0,
  connected_instances integer NOT NULL DEFAULT 0,
  disconnected_instances integer NOT NULL DEFAULT 0,
  error_instances integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT ON public.evolution_health_snapshots TO authenticated;
GRANT ALL ON public.evolution_health_snapshots TO service_role;

ALTER TABLE public.evolution_health_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master can read snapshots"
ON public.evolution_health_snapshots
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (p.is_master = true OR p.global_role = 'master')
  )
);

CREATE INDEX IF NOT EXISTS idx_evolution_health_snapshots_created_at
  ON public.evolution_health_snapshots(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_evolution_health_snapshots_health_created
  ON public.evolution_health_snapshots(health, created_at DESC);

-- Pendência Fase futura: implementar retenção automática (7/15/30 dias) via cron.
