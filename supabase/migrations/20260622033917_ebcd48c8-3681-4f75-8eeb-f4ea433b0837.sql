
-- Phase 2.8: webhook timestamp + message flow aggregation
ALTER TABLE public.whatsapp_instances ADD COLUMN IF NOT EXISTS last_webhook_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_messages_channel_created
  ON public.messages(channel_id, created_at DESC);

-- Aggregated message-flow stats per channel for last 24h.
-- Used only by master-monitoring-status edge function via service_role.
CREATE OR REPLACE FUNCTION public.master_message_flow_24h()
RETURNS TABLE (
  channel_id uuid,
  inbound_24h bigint,
  outbound_24h bigint,
  failed_24h bigint,
  pending_24h bigint,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.channel_id,
    count(*) FILTER (WHERE m.direction = 'inbound')                              AS inbound_24h,
    count(*) FILTER (WHERE m.direction = 'outbound')                             AS outbound_24h,
    count(*) FILTER (WHERE m.direction = 'outbound'
                       AND (m.status = 'failed'
                            OR m.delivery_status = 'failed'
                            OR m.failed_at IS NOT NULL))                         AS failed_24h,
    count(*) FILTER (WHERE m.direction = 'outbound'
                       AND (m.status IN ('pending','sending')
                            OR m.delivery_status IN ('pending','sending')))      AS pending_24h,
    max(m.created_at) FILTER (WHERE m.direction = 'inbound')                     AS last_inbound_at,
    max(m.created_at) FILTER (WHERE m.direction = 'outbound')                    AS last_outbound_at
  FROM public.messages m
  WHERE m.created_at >= now() - interval '24 hours'
    AND m.channel_id IS NOT NULL
  GROUP BY m.channel_id;
$$;

REVOKE ALL ON FUNCTION public.master_message_flow_24h() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_message_flow_24h() FROM anon;
REVOKE ALL ON FUNCTION public.master_message_flow_24h() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.master_message_flow_24h() TO service_role;
