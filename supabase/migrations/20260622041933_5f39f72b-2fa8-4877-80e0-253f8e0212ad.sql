-- Phase 2.13: monitoring_events table for advanced monitoring logs
CREATE TABLE IF NOT EXISTS public.monitoring_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  source text NOT NULL DEFAULT 'system',
  provider text,
  channel text,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  connection_id uuid,
  title text NOT NULL,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT ON public.monitoring_events TO authenticated;
GRANT ALL ON public.monitoring_events TO service_role;

ALTER TABLE public.monitoring_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monitoring_events_master_select"
ON public.monitoring_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (p.is_master = true OR p.global_role = 'master')
  )
);

CREATE INDEX IF NOT EXISTS idx_monitoring_events_created_at
  ON public.monitoring_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitoring_events_severity_created
  ON public.monitoring_events(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitoring_events_type_created
  ON public.monitoring_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitoring_events_company_created
  ON public.monitoring_events(company_id, created_at DESC);

-- Cleanup function (30 days retention)
CREATE OR REPLACE FUNCTION public.monitoring_events_cleanup()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.monitoring_events
  WHERE created_at < now() - interval '30 days';
$$;

REVOKE ALL ON FUNCTION public.monitoring_events_cleanup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.monitoring_events_cleanup() TO service_role;

-- Deduplicated insert helper (15 minutes window for same event_type+provider+connection_id+severity)
CREATE OR REPLACE FUNCTION public.monitoring_events_log(
  _event_type text,
  _severity text,
  _source text,
  _provider text,
  _channel text,
  _company_id uuid,
  _connection_id uuid,
  _title text,
  _description text,
  _metadata jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing uuid;
  _new_id uuid;
BEGIN
  SELECT id INTO _existing
  FROM public.monitoring_events
  WHERE event_type = _event_type
    AND severity = _severity
    AND COALESCE(provider, '') = COALESCE(_provider, '')
    AND COALESCE(connection_id::text, '') = COALESCE(_connection_id::text, '')
    AND created_at > now() - interval '15 minutes'
  ORDER BY created_at DESC
  LIMIT 1;

  IF _existing IS NOT NULL AND _severity IN ('info','warning') THEN
    RETURN _existing;
  END IF;

  INSERT INTO public.monitoring_events(
    event_type, severity, source, provider, channel,
    company_id, connection_id, title, description, metadata
  ) VALUES (
    _event_type, _severity, COALESCE(_source,'system'), _provider, _channel,
    _company_id, _connection_id, _title, _description, COALESCE(_metadata, '{}'::jsonb)
  )
  RETURNING id INTO _new_id;
  RETURN _new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.monitoring_events_log(text,text,text,text,text,uuid,uuid,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.monitoring_events_log(text,text,text,text,text,uuid,uuid,text,text,jsonb) TO service_role;

-- Phase 2.12: Aggregation RPCs for Master only
-- Evolution aggregates
CREATE OR REPLACE FUNCTION public.master_evolution_aggregates(_days integer)
RETURNS TABLE(
  total_snapshots bigint,
  online_snapshots bigint,
  offline_snapshots bigint,
  online_pct numeric,
  avg_latency_ms numeric,
  max_latency_ms integer,
  min_latency_ms integer,
  avg_connected numeric,
  avg_disconnected numeric,
  total_errors bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT * FROM public.evolution_health_snapshots
    WHERE created_at >= now() - make_interval(days => GREATEST(_days,1))
  )
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE api_online = true)::bigint,
    count(*) FILTER (WHERE api_online = false)::bigint,
    CASE WHEN count(*) = 0 THEN 0
         ELSE round((count(*) FILTER (WHERE api_online = true))::numeric * 100 / count(*), 2)
    END,
    round(avg(response_time_ms)::numeric, 1),
    max(response_time_ms),
    min(response_time_ms),
    round(avg(connected_instances)::numeric, 1),
    round(avg(disconnected_instances)::numeric, 1),
    coalesce(sum(error_instances),0)::bigint
  FROM base;
$$;

REVOKE ALL ON FUNCTION public.master_evolution_aggregates(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.master_evolution_aggregates(integer) TO authenticated;

-- VPS aggregates
CREATE OR REPLACE FUNCTION public.master_vps_aggregates(_days integer)
RETURNS TABLE(
  total_snapshots bigint,
  healthy_snapshots bigint,
  critical_snapshots bigint,
  healthy_pct numeric,
  avg_cpu numeric,
  max_cpu numeric,
  avg_memory numeric,
  max_memory numeric,
  avg_disk numeric,
  max_disk numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT * FROM public.infrastructure_health_snapshots
    WHERE created_at >= now() - make_interval(days => GREATEST(_days,1))
  )
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE health = 'healthy')::bigint,
    count(*) FILTER (WHERE health = 'critical')::bigint,
    CASE WHEN count(*) = 0 THEN 0
         ELSE round((count(*) FILTER (WHERE health = 'healthy'))::numeric * 100 / count(*), 2)
    END,
    round(avg(cpu_percent)::numeric, 1),
    round(max(cpu_percent)::numeric, 1),
    round(avg(memory_percent)::numeric, 1),
    round(max(memory_percent)::numeric, 1),
    round(avg(disk_percent)::numeric, 1),
    round(max(disk_percent)::numeric, 1)
  FROM base;
$$;

REVOKE ALL ON FUNCTION public.master_vps_aggregates(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.master_vps_aggregates(integer) TO authenticated;

-- Connections aggregates: top problematic
CREATE OR REPLACE FUNCTION public.master_connection_aggregates(_days integer, _limit integer DEFAULT 10)
RETURNS TABLE(
  connection_id uuid,
  company_id uuid,
  instance_name text,
  identifier text,
  channel text,
  provider text,
  offline_count bigint,
  error_count bigint,
  total_snapshots bigint,
  last_event_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.connection_id,
    s.company_id,
    max(s.instance_name),
    max(s.identifier),
    max(s.channel),
    max(s.provider),
    count(*) FILTER (WHERE s.health = 'offline')::bigint AS offline_count,
    coalesce(sum(s.error_count),0)::bigint AS error_count,
    count(*)::bigint AS total_snapshots,
    max(s.created_at) AS last_event_at
  FROM public.connection_health_snapshots s
  WHERE s.created_at >= now() - make_interval(days => GREATEST(_days,1))
    AND s.connection_id IS NOT NULL
  GROUP BY s.connection_id, s.company_id
  ORDER BY offline_count DESC, error_count DESC
  LIMIT GREATEST(_limit, 1);
$$;

REVOKE ALL ON FUNCTION public.master_connection_aggregates(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.master_connection_aggregates(integer, integer) TO authenticated;

-- Flow aggregates
CREATE OR REPLACE FUNCTION public.master_flow_aggregates(_days integer)
RETURNS TABLE(
  total_inbound bigint,
  total_outbound bigint,
  total_failed bigint,
  total_pending bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH latest_per_day AS (
    SELECT DISTINCT ON (connection_id, date_trunc('hour', created_at))
      connection_id, inbound_count_24h, outbound_count_24h,
      failed_count_24h, pending_count_24h, created_at
    FROM public.connection_message_flow_snapshots
    WHERE created_at >= now() - make_interval(days => GREATEST(_days,1))
    ORDER BY connection_id, date_trunc('hour', created_at), created_at DESC
  )
  SELECT
    coalesce(sum(inbound_count_24h),0)::bigint,
    coalesce(sum(outbound_count_24h),0)::bigint,
    coalesce(sum(failed_count_24h),0)::bigint,
    coalesce(sum(pending_count_24h),0)::bigint
  FROM latest_per_day;
$$;

REVOKE ALL ON FUNCTION public.master_flow_aggregates(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.master_flow_aggregates(integer) TO authenticated;