-- Add internal Master check to aggregation RPCs (defense in depth)
CREATE OR REPLACE FUNCTION public.master_evolution_aggregates(_days integer)
RETURNS TABLE(
  total_snapshots bigint, online_snapshots bigint, offline_snapshots bigint,
  online_pct numeric, avg_latency_ms numeric, max_latency_ms integer, min_latency_ms integer,
  avg_connected numeric, avg_disconnected numeric, total_errors bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (p.is_master = true OR p.global_role = 'master')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  WITH base AS (SELECT * FROM public.evolution_health_snapshots WHERE created_at >= now() - make_interval(days => GREATEST(_days,1)))
  SELECT count(*)::bigint,
    count(*) FILTER (WHERE api_online = true)::bigint,
    count(*) FILTER (WHERE api_online = false)::bigint,
    CASE WHEN count(*)=0 THEN 0 ELSE round((count(*) FILTER (WHERE api_online = true))::numeric*100/count(*),2) END,
    round(avg(response_time_ms)::numeric,1), max(response_time_ms), min(response_time_ms),
    round(avg(connected_instances)::numeric,1), round(avg(disconnected_instances)::numeric,1),
    coalesce(sum(error_instances),0)::bigint
  FROM base;
END $$;

CREATE OR REPLACE FUNCTION public.master_vps_aggregates(_days integer)
RETURNS TABLE(
  total_snapshots bigint, healthy_snapshots bigint, critical_snapshots bigint, healthy_pct numeric,
  avg_cpu numeric, max_cpu numeric, avg_memory numeric, max_memory numeric, avg_disk numeric, max_disk numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (p.is_master = true OR p.global_role = 'master')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  WITH base AS (SELECT * FROM public.infrastructure_health_snapshots WHERE created_at >= now() - make_interval(days => GREATEST(_days,1)))
  SELECT count(*)::bigint,
    count(*) FILTER (WHERE health='healthy')::bigint,
    count(*) FILTER (WHERE health='critical')::bigint,
    CASE WHEN count(*)=0 THEN 0 ELSE round((count(*) FILTER (WHERE health='healthy'))::numeric*100/count(*),2) END,
    round(avg(cpu_percent)::numeric,1), round(max(cpu_percent)::numeric,1),
    round(avg(memory_percent)::numeric,1), round(max(memory_percent)::numeric,1),
    round(avg(disk_percent)::numeric,1), round(max(disk_percent)::numeric,1)
  FROM base;
END $$;

CREATE OR REPLACE FUNCTION public.master_connection_aggregates(_days integer, _limit integer DEFAULT 10)
RETURNS TABLE(
  connection_id uuid, company_id uuid, instance_name text, identifier text, channel text, provider text,
  offline_count bigint, error_count bigint, total_snapshots bigint, last_event_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (p.is_master = true OR p.global_role = 'master')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT s.connection_id, s.company_id, max(s.instance_name), max(s.identifier), max(s.channel), max(s.provider),
    count(*) FILTER (WHERE s.health='offline')::bigint, coalesce(sum(s.error_count),0)::bigint,
    count(*)::bigint, max(s.created_at)
  FROM public.connection_health_snapshots s
  WHERE s.created_at >= now() - make_interval(days => GREATEST(_days,1)) AND s.connection_id IS NOT NULL
  GROUP BY s.connection_id, s.company_id
  ORDER BY count(*) FILTER (WHERE s.health='offline') DESC, coalesce(sum(s.error_count),0) DESC
  LIMIT GREATEST(_limit,1);
END $$;

CREATE OR REPLACE FUNCTION public.master_flow_aggregates(_days integer)
RETURNS TABLE(total_inbound bigint, total_outbound bigint, total_failed bigint, total_pending bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (p.is_master = true OR p.global_role = 'master')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (connection_id, date_trunc('hour', created_at))
      connection_id, inbound_count_24h, outbound_count_24h, failed_count_24h, pending_count_24h, created_at
    FROM public.connection_message_flow_snapshots
    WHERE created_at >= now() - make_interval(days => GREATEST(_days,1))
    ORDER BY connection_id, date_trunc('hour', created_at), created_at DESC
  )
  SELECT coalesce(sum(inbound_count_24h),0)::bigint, coalesce(sum(outbound_count_24h),0)::bigint,
    coalesce(sum(failed_count_24h),0)::bigint, coalesce(sum(pending_count_24h),0)::bigint
  FROM latest;
END $$;