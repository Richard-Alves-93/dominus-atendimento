import { useCallback, useEffect, useMemo, useState } from "react";
import { MasterLayout } from "@/components/MasterLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  HelpCircle,
  LineChart as LineChartIcon,
  Mail,
  MessageCircle,
  PlugZap,
  PowerOff,
  Radio,
  Server,
  Wifi,
} from "lucide-react";
import {
  computeEvolutionAlerts,
  computeConnectionAlerts,
  computeOscillationAlert,
  computeVpsAlerts,
  computeConnectionStability,
  computeStabilityAlerts,
  computeFlowDiagnosis,
  computeFlowAlerts,
  flowHealthLabel,
  flowHealthClasses,
  recommendationForConnection,
  stabilityLabel,
  stabilityClasses,
  statusLabelPt,
  formatAgo,
  formatUptime,
  severityClasses,
  severityLabel,
  severityRank,
  type OperationalAlert,
  type VpsLive,
  type StabilityInfo,
  type ConnectionSnapshot,
  type MessageFlow,
} from "@/lib/monitoringAlerts";
import {
  computeEvolutionLatencyTrend,
  computeVpsTrendAlerts,
  computeFlowTrendAlerts,
  rowsToCsv,
  downloadCsv,
  exportPeriodHours,
  EXPORT_MAX_ROWS,
  type ExportPeriod,
  type FlowTrendSnap,
} from "@/lib/monitoringTrends";
import { Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Cpu, HardDrive, MemoryStick, Timer } from "lucide-react";


// Estados padronizados (preparados para multicanal)
type OpStatus =
  | "connected"
  | "disconnected"
  | "connecting"
  | "error"
  | "paused"
  | "disabled"
  | "unknown";
type Health =
  | "healthy"
  | "warning"
  | "critical"
  | "offline"
  | "pending_auth"
  | "pending_qr"
  | "expired_token"
  | "sync_delayed"
  | "rate_limited"
  | "unknown";

type ConnectionRow = {
  id: string;
  companyId: string | null;
  companyName: string;
  channelType: string;
  provider: string;
  name: string;
  identifier: string;
  status: OpStatus;
  health: Health;
  lastActivityAt: string | null;
  lastError: string | null;
  raw: Record<string, unknown>;
};

const mapWhatsAppStatus = (s: string | null | undefined): { status: OpStatus; health: Health } => {
  switch ((s ?? "").toLowerCase()) {
    case "connected":
    case "open":
      return { status: "connected", health: "healthy" };
    case "pending":
    case "connecting":
    case "qr":
      return { status: "connecting", health: "pending_qr" };
    case "disconnected":
    case "close":
      return { status: "disconnected", health: "offline" };
    case "error":
      return { status: "error", health: "critical" };
    case "disabled":
      return { status: "disabled", health: "offline" };
    default:
      return { status: "unknown", health: "unknown" };
  }
};

const healthLabel = (h: Health) => {
  const map: Record<Health, string> = {
    healthy: "Saudável",
    warning: "Atenção",
    critical: "Crítico",
    offline: "Offline",
    pending_auth: "Autenticação pendente",
    pending_qr: "QR Code pendente",
    expired_token: "Token expirado",
    sync_delayed: "Sincronização atrasada",
    rate_limited: "Limite atingido",
    unknown: "Desconhecido",
  };
  return map[h] ?? h;
};

const statusLabel = (s: OpStatus) => {
  const map: Record<OpStatus, string> = {
    connected: "Conectado",
    disconnected: "Desconectado",
    connecting: "Conectando",
    error: "Erro",
    paused: "Pausado",
    disabled: "Desativado",
    unknown: "Desconhecido",
  };
  return map[s] ?? s;
};

const channelTypeLabel = (t: string) => {
  const map: Record<string, string> = {
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    facebook: "Facebook Messenger",
    messenger: "Facebook Messenger",
    email: "E-mail",
    telegram: "Telegram",
    webchat: "Webchat",
  };
  return map[t] ?? t;
};

const providerLabel = (p: string) => {
  const map: Record<string, string> = {
    evolution: "Evolution",
    evogo: "EvoGo",
    meta: "Meta API",
    meta_cloud: "Meta API",
    smtp_imap: "IMAP/SMTP",
    imap_smtp: "IMAP/SMTP",
    gmail: "Gmail",
    outlook: "Outlook",
    manual: "Manual",
  };
  return map[p] ?? p;
};

// Mapeamento de estados futuros (Meta API / IMAP/SMTP) para apresentação em português.
// Mantemos os valores internos do banco intactos; traduzimos apenas na UI.
const providerStateLabel = (s: string) => {
  const map: Record<string, string> = {
    configured: "Configurado",
    not_configured: "Não configurado",
    planned: "Planejado",
    pending_auth: "Autenticação pendente",
    expired_token: "Token expirado",
    webhook_inactive: "Webhook inativo",
    sync_delayed: "Sincronização atrasada",
    auth_error: "Erro de autenticação",
    rate_limited: "Limite atingido",
    healthy: "Saudável",
    warning: "Atenção",
    critical: "Crítico",
    offline: "Offline",
    unknown: "Desconhecido",
  };
  return map[s] ?? s;
};

const healthColor = (h: Health) => {
  switch (h) {
    case "healthy":
      return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
    case "warning":
    case "pending_qr":
    case "pending_auth":
    case "sync_delayed":
    case "rate_limited":
      return "bg-amber-500/15 text-amber-600 border-amber-500/30";
    case "critical":
    case "expired_token":
      return "bg-red-500/15 text-red-600 border-red-500/30";
    case "offline":
      return "bg-zinc-500/15 text-zinc-600 border-zinc-500/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
};

const fmtDate = (iso: string | null) => {
  if (!iso) return "Não disponível";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
};

const channelIcon = (t: string) => {
  switch (t) {
    case "whatsapp":
      return MessageCircle;
    case "instagram":
    case "facebook":
      return Radio;
    case "email":
      return Mail;
    default:
      return PlugZap;
  }
};

export default function MasterMonitoramento() {
  const [rows, setRows] = useState<ConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ConnectionRow | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [live, setLive] = useState<{
    checked_at: string;
    online: boolean;
    response_time_ms: number | null;
    health: Health;
    error?: string | null;
    total_instances: number;
    connected_instances: number;
    disconnected_instances: number;
    error_instances: number;
    liveStateByInstance: Record<string, OpStatus>;
  } | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);

  type HistoryPeriod = "1h" | "6h" | "24h";
  type Snapshot = {
    id: string;
    created_at: string;
    api_online: boolean;
    health: Health;
    response_time_ms: number | null;
    total_instances: number;
    connected_instances: number;
    disconnected_instances: number;
    error_instances: number;
  };
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [period, setPeriod] = useState<HistoryPeriod>("24h");
  type HealthFilter = "all" | "healthy" | "warning" | "critical" | "offline";
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");

  const [vps, setVps] = useState<NonNullable<VpsLive> | null>(null);

  // Phase 2.8: message-flow map keyed by channel_id
  const [flowByChannel, setFlowByChannel] = useState<Map<string, NonNullable<MessageFlow>>>(new Map());


  type InfraSnapshot = {
    created_at: string;
    cpu_percent: number | null;
    memory_percent: number | null;
    disk_percent: number | null;
  };
  const [infraHistory, setInfraHistory] = useState<InfraSnapshot[]>([]);

  // Fase 2.10: snapshots de fluxo recentes (todas as conexões) para tendência
  const [flowTrendSnaps, setFlowTrendSnaps] = useState<FlowTrendSnap[]>([]);
  // Fase 2.11: período de exportação
  const [exportPeriod, setExportPeriod] = useState<ExportPeriod>("24h");
  const [exporting, setExporting] = useState<string | null>(null);

  // Fase 2.12: agregados semanais/mensais
  type AggPeriod = 7 | 30;
  const [aggPeriod, setAggPeriod] = useState<AggPeriod>(7);
  const [aggEvo, setAggEvo] = useState<any | null>(null);
  const [aggVps, setAggVps] = useState<any | null>(null);
  const [aggFlow, setAggFlow] = useState<any | null>(null);
  const [aggTopConn, setAggTopConn] = useState<any[]>([]);
  const [aggLoading, setAggLoading] = useState(false);

  // Fase 2.13: logs do monitoramento
  type MonitoringLog = {
    id: string;
    created_at: string;
    event_type: string;
    severity: string;
    source: string;
    provider: string | null;
    channel: string | null;
    company_id: string | null;
    connection_id: string | null;
    title: string;
    description: string | null;
  };
  const [logs, setLogs] = useState<MonitoringLog[]>([]);
  const [logsFilter, setLogsFilter] = useState<string>("todos");
  const [logsLoading, setLogsLoading] = useState(false);

  // Snapshots por conexão (Fase 2.7)
  type ConnHealthRow = {
    connection_id: string | null;
    instance_name: string | null;
    created_at: string;
    status: string;
    health: string;
  };
  const [connHistory, setConnHistory] = useState<ConnHealthRow[]>([]);

  // Phase 2.9: histórico de fluxo por conexão (drawer)
  type FlowSnapshotRow = {
    created_at: string;
    inbound_count_24h: number;
    outbound_count_24h: number;
    failed_count_24h: number;
    pending_count_24h: number;
  };
  const [flowHistory, setFlowHistory] = useState<FlowSnapshotRow[]>([]);
  const [flowHistoryPeriod, setFlowHistoryPeriod] = useState<HistoryPeriod>("24h");
  const [flowHistoryLoading, setFlowHistoryLoading] = useState(false);

  const loadFlowHistory = useCallback(
    async (connectionId: string | null, p: HistoryPeriod) => {
      if (!connectionId) {
        setFlowHistory([]);
        return;
      }
      setFlowHistoryLoading(true);
      try {
        const hours = p === "1h" ? 1 : p === "6h" ? 6 : 24;
        const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
        const { data, error } = await (supabase
          .from("connection_message_flow_snapshots") as any)
          .select(
            "created_at, inbound_count_24h, outbound_count_24h, failed_count_24h, pending_count_24h",
          )
          .eq("connection_id", connectionId)
          .gte("created_at", since)
          .order("created_at", { ascending: true })
          .limit(500);
        if (error) throw error;
        setFlowHistory((data ?? []) as FlowSnapshotRow[]);
      } catch {
        setFlowHistory([]);
      } finally {
        setFlowHistoryLoading(false);
      }
    },
    [],
  );

  type ConfigStats = {
    lastCronEvo: string | null;
    lastManualEvo: string | null;
    lastCronInfra: string | null;
    evoCount24h: number;
    infraCount24h: number;
    evoFails24h: number;
    infraFails24h: number;
    vpsConfigured: boolean;
  };
  const [configStats, setConfigStats] = useState<ConfigStats | null>(null);

  const loadConfigStats = useCallback(async () => {
    try {
      const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const [lastCronEvoRes, lastManualEvoRes, lastCronInfraRes, evo24hRes, infra24hRes] =
        await Promise.all([
          (supabase.from("evolution_health_snapshots") as any)
            .select("created_at")
            .eq("source", "cron")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          (supabase.from("evolution_health_snapshots") as any)
            .select("created_at")
            .neq("source", "cron")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          (supabase.from("infrastructure_health_snapshots") as any)
            .select("created_at")
            .eq("source", "cron")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          (supabase.from("evolution_health_snapshots") as any)
            .select("api_online", { count: "exact" })
            .gte("created_at", since24h),
          (supabase.from("infrastructure_health_snapshots") as any)
            .select("status", { count: "exact" })
            .gte("created_at", since24h),
        ]);
      const evoRows = (evo24hRes.data ?? []) as Array<{ api_online: boolean }>;
      const infraRows = (infra24hRes.data ?? []) as Array<{ status: string }>;
      setConfigStats({
        lastCronEvo: lastCronEvoRes.data?.created_at ?? null,
        lastManualEvo: lastManualEvoRes.data?.created_at ?? null,
        lastCronInfra: lastCronInfraRes.data?.created_at ?? null,
        evoCount24h: evo24hRes.count ?? evoRows.length,
        infraCount24h: infra24hRes.count ?? infraRows.length,
        evoFails24h: evoRows.filter((r) => r.api_online === false).length,
        infraFails24h: infraRows.filter((r) => r.status !== "online").length,
        vpsConfigured: (lastCronInfraRes.data?.created_at ?? null) !== null,
      });
    } catch {
      /* ignore */
    }
  }, []);

  const loadInfraHistory = useCallback(async (p: HistoryPeriod) => {
    try {
      const hours = p === "1h" ? 1 : p === "6h" ? 6 : 24;
      const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
      const { data, error } = await (supabase.from("infrastructure_health_snapshots") as any)
        .select("created_at, cpu_percent, memory_percent, disk_percent")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      setInfraHistory((data ?? []) as InfraSnapshot[]);
    } catch {
      setInfraHistory([]);
    }
  }, []);

  const loadConnHistory = useCallback(async (p: HistoryPeriod) => {
    try {
      const hours = p === "1h" ? 1 : p === "6h" ? 6 : 24;
      const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
      const { data, error } = await (supabase.from("connection_health_snapshots") as any)
        .select("connection_id, instance_name, created_at, status, health")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(5000);
      if (error) throw error;
      setConnHistory((data ?? []) as ConnHealthRow[]);
    } catch {
      setConnHistory([]);
    }
  }, []);

  // Fase 2.10: snapshots recentes de fluxo para análise de tendência
  const loadFlowTrendSnaps = useCallback(async () => {
    try {
      const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
      const { data, error } = await (supabase.from("connection_message_flow_snapshots") as any)
        .select("created_at, connection_id, failed_count_24h, pending_count_24h")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(3000);
      if (error) throw error;
      setFlowTrendSnaps((data ?? []) as FlowTrendSnap[]);
    } catch {
      setFlowTrendSnaps([]);
    }
  }, []);

  // Fase 2.12: carregar agregados (7/30 dias)
  const loadAggregates = useCallback(async (days: AggPeriod) => {
    setAggLoading(true);
    try {
      const [evo, vps, flow, conn] = await Promise.all([
        (supabase as any).rpc("master_evolution_aggregates", { _days: days }),
        (supabase as any).rpc("master_vps_aggregates", { _days: days }),
        (supabase as any).rpc("master_flow_aggregates", { _days: days }),
        (supabase as any).rpc("master_connection_aggregates", { _days: days, _limit: 10 }),
      ]);
      setAggEvo(Array.isArray(evo.data) ? evo.data[0] ?? null : evo.data ?? null);
      setAggVps(Array.isArray(vps.data) ? vps.data[0] ?? null : vps.data ?? null);
      setAggFlow(Array.isArray(flow.data) ? flow.data[0] ?? null : flow.data ?? null);
      setAggTopConn(Array.isArray(conn.data) ? conn.data : []);
    } catch {
      setAggEvo(null); setAggVps(null); setAggFlow(null); setAggTopConn([]);
    } finally {
      setAggLoading(false);
    }
  }, []);

  // Fase 2.13: carregar logs do monitoramento
  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const { data, error } = await (supabase.from("monitoring_events") as any)
        .select("id, created_at, event_type, severity, source, provider, channel, company_id, connection_id, title, description")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      setLogs((data ?? []) as MonitoringLog[]);
    } catch {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, []);








  const loadHistory = useCallback(async (p: HistoryPeriod) => {
    setHistoryLoading(true);
    try {
      const hours = p === "1h" ? 1 : p === "6h" ? 6 : 24;
      const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
      const { data, error } = await (supabase.from("evolution_health_snapshots") as any)
        .select(
          "id, created_at, api_online, health, response_time_ms, total_instances, connected_instances, disconnected_instances, error_instances"
        )
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      setHistory((data ?? []) as Snapshot[]);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadPersisted = useCallback(async () => {
    const [channelsRes, instancesRes, companiesRes] = await Promise.all([
      (supabase.from("channels") as any).select(
        "id, company_id, channel_type, channel_provider, name, status, external_id, phone_number, email_address, metadata, updated_at"
      ),
      (supabase.from("whatsapp_instances") as any).select(
        "id, company_id, channel_id, instance_name, phone_number, status, connected_at, disconnected_at, updated_at, settings_sync_error, last_settings_sync_at"
      ),
      (supabase.from("companies") as any).select("id, name"),
    ]);

    const companies = new Map<string, string>(
      (companiesRes.data ?? []).map((c: any) => [c.id, c.name])
    );

    const list: ConnectionRow[] = [];
    for (const inst of instancesRes.data ?? []) {
      const m = mapWhatsAppStatus(inst.status);
      list.push({
        id: `inst:${inst.id}`,
        companyId: inst.company_id,
        companyName: companies.get(inst.company_id) ?? "—",
        channelType: "whatsapp",
        provider: "evolution",
        name: inst.instance_name ?? "Instância",
        identifier: inst.phone_number ?? inst.instance_name ?? "—",
        status: m.status,
        health: m.health,
        lastActivityAt: inst.updated_at ?? inst.connected_at ?? null,
        lastError: inst.settings_sync_error ?? null,
        raw: inst,
      });
    }

    for (const ch of channelsRes.data ?? []) {
      if (ch.channel_provider === "evolution" || ch.channel_provider === "evogo") continue;
      const status: OpStatus =
        ch.status === "connected"
          ? "connected"
          : ch.status === "error"
            ? "error"
            : ch.status === "disabled"
              ? "disabled"
              : ch.status === "pending"
                ? "connecting"
                : "disconnected";
      const health: Health =
        status === "connected"
          ? "healthy"
          : status === "error"
            ? "critical"
            : status === "connecting"
              ? "pending_auth"
              : "offline";
      list.push({
        id: `ch:${ch.id}`,
        companyId: ch.company_id,
        companyName: companies.get(ch.company_id) ?? "—",
        channelType: ch.channel_type,
        provider: ch.channel_provider,
        name: ch.name ?? "Canal",
        identifier: ch.phone_number ?? ch.email_address ?? ch.external_id ?? "—",
        status,
        health,
        lastActivityAt: ch.updated_at ?? null,
        lastError: null,
        raw: ch,
      });
    }

    setRows(list);
  }, []);

  const loadLive = useCallback(async (saveSnapshot = false) => {
    setLiveLoading(true);
    setLiveError(null);
    try {
      const { data, error } = await supabase.functions.invoke("master-monitoring-status", {
        body: { save_snapshot: saveSnapshot, source: saveSnapshot ? "manual_refresh" : "view" },
      });
      if (error) throw error;
      const evo = data?.evolution ?? {};
      const map: Record<string, OpStatus> = {};
      const flowMap = new Map<string, NonNullable<MessageFlow>>();
      for (const c of (data?.connections ?? []) as any[]) {
        if (c?.provider === "evolution" && c?.instance_name && c?.live_checked) {
          map[c.instance_name] = c.status as OpStatus;
        }
        if (c?.channel_id && c?.flow) {
          flowMap.set(String(c.channel_id), {
            inbound_24h: Number(c.flow.inbound_24h ?? 0),
            outbound_24h: Number(c.flow.outbound_24h ?? 0),
            failed_24h: Number(c.flow.failed_24h ?? 0),
            pending_24h: Number(c.flow.pending_24h ?? 0),
            last_inbound_at: c.flow.last_inbound_at ?? null,
            last_outbound_at: c.flow.last_outbound_at ?? null,
            last_webhook_at: c.last_webhook_at ?? null,
          });
        } else if (c?.channel_id && c?.last_webhook_at) {
          flowMap.set(String(c.channel_id), {
            inbound_24h: 0, outbound_24h: 0, failed_24h: 0, pending_24h: 0,
            last_inbound_at: null, last_outbound_at: null,
            last_webhook_at: c.last_webhook_at,
          });
        }
      }
      setFlowByChannel(flowMap);

      setLive({
        checked_at: data?.checked_at ?? new Date().toISOString(),
        online: !!evo.online,
        response_time_ms: evo.response_time_ms ?? null,
        health: (evo.health as Health) ?? "unknown",
        error: evo.error ?? null,
        total_instances: evo.total_instances ?? 0,
        connected_instances: evo.connected_instances ?? 0,
        disconnected_instances: evo.disconnected_instances ?? 0,
        error_instances: evo.error_instances ?? 0,
        liveStateByInstance: map,
      });
      if (data?.infrastructure) setVps(data.infrastructure);
    } catch (e: any) {
      setLiveError(e?.message ?? "Falha ao consultar status real.");
    } finally {
      setLiveLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadPersisted();
      if (cancelled) return;
      setLoading(false);
      loadLive(false);
      loadHistory(period);
      loadInfraHistory(period);
      loadConnHistory(period);
      loadConfigStats();
      loadFlowTrendSnaps();
      loadAggregates(aggPeriod);
      loadLogs();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadPersisted, loadLive]);

  useEffect(() => {
    loadHistory(period);
    loadInfraHistory(period);
    loadConnHistory(period);
  }, [period, loadHistory, loadInfraHistory, loadConnHistory]);

  // Fase 2.12: recarregar agregados ao trocar período
  useEffect(() => {
    loadAggregates(aggPeriod);
  }, [aggPeriod, loadAggregates]);

  // Phase 2.9: carregar histórico de fluxo ao abrir/trocar período do drawer
  useEffect(() => {
    const realId = (selected?.raw as any)?.id as string | undefined;
    loadFlowHistory(realId ?? null, flowHistoryPeriod);
  }, [selected, flowHistoryPeriod, loadFlowHistory]);

  const handleRefresh = async () => {
    await loadLive(true);
    await loadHistory(period);
    await loadInfraHistory(period);
    await loadConnHistory(period);
    await loadConfigStats();
    await loadFlowTrendSnaps();
    await loadAggregates(aggPeriod);
    await loadLogs();
  };



  // Apply live state to rows
  const mergedRows = useMemo(() => {
    if (!live) return rows;
    return rows.map((r) => {
      if (r.provider !== "evolution") return r;
      const liveStatus = live.liveStateByInstance[r.name];
      if (!liveStatus) return r;
      const m = mapWhatsAppStatus(liveStatus);
      return { ...r, status: m.status, health: m.health };
    });
  }, [rows, live]);


  const summary = useMemo(() => {
    const total = mergedRows.length;
    const healthy = mergedRows.filter((r) => r.health === "healthy").length;
    const warning = mergedRows.filter((r) =>
      ["warning", "pending_qr", "pending_auth", "sync_delayed", "rate_limited"].includes(r.health)
    ).length;
    const offline = mergedRows.filter((r) => r.health === "offline" || r.status === "disconnected").length;
    const critical = mergedRows.filter((r) => r.health === "critical").length;
    const companiesWithAlert = new Set(
      mergedRows
        .filter((r) => r.health !== "healthy" && r.companyId)
        .map((r) => r.companyId)
    ).size;
    return { total, healthy, warning, offline, critical, companiesWithAlert };
  }, [mergedRows]);

  const evolutionInstances = mergedRows.filter((r) => r.provider === "evolution");
  const persistedEvoStats = {
    total: evolutionInstances.length,
    connected: evolutionInstances.filter((r) => r.status === "connected").length,
    disconnected: evolutionInstances.filter((r) => r.status === "disconnected").length,
    errors: evolutionInstances.filter((r) => r.status === "error").length,
  };
  const evoStats = live
    ? {
        total: live.total_instances,
        connected: live.connected_instances,
        disconnected: live.disconnected_instances,
        errors: live.error_instances,
      }
    : persistedEvoStats;
  const evoProviderHealth: Health = live
    ? live.health
    : evoStats.total === 0
      ? "unknown"
      : evoStats.errors > 0
        ? "critical"
        : evoStats.disconnected > 0
          ? "warning"
          : "healthy";


  // Mapa de estabilidade por linha (id), usando connection_id (UUID) ou instance_name como chave
  const stabilityByRow = useMemo(() => {
    const byKey = new Map<string, ConnectionSnapshot[]>();
    for (const s of connHistory) {
      const key = s.connection_id ?? (s.instance_name ? `name:${s.instance_name}` : null);
      if (!key) continue;
      const arr = byKey.get(key) ?? [];
      arr.push({ created_at: s.created_at, status: s.status, health: s.health });
      byKey.set(key, arr);
    }
    const map = new Map<string, StabilityInfo>();
    for (const r of mergedRows) {
      // r.id é "inst:<uuid>" ou "ch:<uuid>"; o uuid real está em raw.id
      const realId = (r.raw as any)?.id as string | undefined;
      const snaps =
        (realId && byKey.get(realId)) ??
        (r.name ? byKey.get(`name:${r.name}`) : undefined) ??
        [];
      map.set(r.id, computeConnectionStability(snaps));
    }
    return map;
  }, [connHistory, mergedRows]);

  // Phase 2.8: lookup flow per row using channel_id
  const flowByRow = useMemo(() => {
    const m = new Map<string, NonNullable<MessageFlow>>();
    for (const r of mergedRows) {
      const raw = r.raw as any;
      const chId = raw?.channel_id ?? raw?.id; // instance has channel_id; channel row has id
      if (chId) {
        const f = flowByChannel.get(String(chId));
        if (f) m.set(r.id, f);
      }
    }
    return m;
  }, [mergedRows, flowByChannel]);


  const alerts: OperationalAlert[] = useMemo(() => {
    const list: OperationalAlert[] = [];
    list.push(...computeEvolutionAlerts(live));
    const osc = computeOscillationAlert(
      history.map((h) => ({ created_at: h.created_at, api_online: h.api_online })),
    );
    if (osc) list.push(osc);
    list.push(
      ...computeConnectionAlerts(
        mergedRows.map((r) => ({
          id: r.id,
          companyName: r.companyName,
          channelType: r.channelType,
          provider: r.provider,
          name: r.name,
          health: r.health,
          status: r.status,
          lastActivityAt: r.lastActivityAt,
          lastError: r.lastError,
        })),
      ),
    );
    // Alertas de oscilação por conexão (Fase 2.7)
    for (const r of mergedRows) {
      const info = stabilityByRow.get(r.id);
      if (!info) continue;
      list.push(
        ...computeStabilityAlerts(
          {
            id: r.id,
            companyName: r.companyName,
            channelType: r.channelType,
            provider: r.provider,
            name: r.name,
            health: r.health,
            status: r.status,
            lastActivityAt: r.lastActivityAt,
            lastError: r.lastError,
          },
          info,
        ),
      );
    }
    // Alertas de fluxo de mensagens por conexão (Fase 2.8)
    for (const r of mergedRows) {
      const flow = flowByRow.get(r.id) ?? null;
      if (!flow) continue;
      list.push(
        ...computeFlowAlerts(
          {
            id: r.id,
            companyName: r.companyName,
            channelType: r.channelType,
            provider: r.provider,
            name: r.name,
            health: r.health,
            status: r.status,
            lastActivityAt: r.lastActivityAt,
            lastError: r.lastError,
          },
          flow,
        ),
      );
    }
    list.push(...computeVpsAlerts(vps));

    // Fase 2.10 — Alertas por tendência
    const latencyTrend = computeEvolutionLatencyTrend(
      history.map((h) => ({ created_at: h.created_at, response_time_ms: h.response_time_ms })),
    );
    if (latencyTrend) list.push(latencyTrend);
    list.push(...computeVpsTrendAlerts(infraHistory, vps));

    // Mapa de conexões para tendência de fluxo
    const connInfoMap = new Map<string, { id: string; companyName: string; name: string; offline: boolean }>();
    for (const r of mergedRows) {
      const raw = r.raw as any;
      const connId = raw?.id ?? raw?.channel_id;
      if (!connId) continue;
      const offline = r.status === "disconnected" || r.health === "offline" || r.status === "error";
      connInfoMap.set(String(connId), {
        id: r.id,
        companyName: r.companyName,
        name: r.name,
        offline,
      });
    }
    list.push(...computeFlowTrendAlerts(flowTrendSnaps, connInfoMap));

    // Dedup por id
    const seen = new Set<string>();
    const dedup = list.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
    return dedup.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  }, [live, history, mergedRows, vps, stabilityByRow, flowByRow, infraHistory, flowTrendSnaps]);


  const filteredRows = useMemo(() => {
    if (healthFilter === "all") return mergedRows;
    return mergedRows.filter((r) => {
      switch (healthFilter) {
        case "healthy":
          return r.health === "healthy";
        case "warning":
          return ["warning", "pending_qr", "pending_auth", "sync_delayed", "rate_limited"].includes(
            r.health,
          );
        case "critical":
          return r.health === "critical" || r.status === "error";
        case "offline":
          return r.health === "offline" || r.status === "disconnected";
        default:
          return true;
      }
    });
  }, [mergedRows, healthFilter]);

  const rowHighlight = (h: Health, s: OpStatus) => {
    if (h === "critical" || s === "error") return "bg-red-500/5 border-l-2 border-l-red-500";
    if (h === "offline" || s === "disconnected") return "bg-zinc-500/5 border-l-2 border-l-zinc-400";
    return "";
  };

  const cards = [
    { label: "Total de conexões", value: summary.total, icon: PlugZap, tone: "bg-primary/10 text-primary" },
    { label: "Saudáveis", value: summary.healthy, icon: CheckCircle2, tone: "bg-emerald-500/15 text-emerald-600" },
    { label: "Com alerta", value: summary.warning, icon: AlertTriangle, tone: "bg-amber-500/15 text-amber-600" },
    { label: "Offline", value: summary.offline, icon: PowerOff, tone: "bg-zinc-500/15 text-zinc-600" },
    { label: "Críticas", value: summary.critical, icon: Activity, tone: "bg-red-500/15 text-red-600" },
    { label: "Empresas com alerta", value: summary.companiesWithAlert, icon: Server, tone: "bg-primary/10 text-primary" },
  ];

  // Fase 2.11 — Exportação CSV de histórico (Master)
  const handleExportCsv = useCallback(
    async (kind: "evolution" | "vps" | "connections" | "flow") => {
      try {
        setExporting(kind);
        const hours = exportPeriodHours(exportPeriod);
        const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
        const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);

        let csv = "";
        let filename = "";
        let rowCount = 0;

        if (kind === "evolution") {
          const cols = [
            "created_at","api_online","health","response_time_ms",
            "total_instances","connected_instances","disconnected_instances","error_instances","source",
          ] as const;
          const { data, error } = await (supabase.from("evolution_health_snapshots") as any)
            .select(cols.join(","))
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(EXPORT_MAX_ROWS);
          if (error) throw error;
          rowCount = (data ?? []).length;
          csv = rowsToCsv((data ?? []) as any[], cols as unknown as string[]);
          filename = `evolution-${exportPeriod}-${stamp}.csv`;
        } else if (kind === "vps") {
          const cols = [
            "created_at","status","health","cpu_percent","memory_percent","disk_percent",
            "load_average","uptime_seconds","response_time_ms","source",
          ] as const;
          const { data, error } = await (supabase.from("infrastructure_health_snapshots") as any)
            .select(cols.join(","))
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(EXPORT_MAX_ROWS);
          if (error) throw error;
          rowCount = (data ?? []).length;
          csv = rowsToCsv((data ?? []) as any[], cols as unknown as string[]);
          filename = `vps-${exportPeriod}-${stamp}.csv`;
        } else if (kind === "connections") {
          const cols = [
            "created_at","company_id","connection_id","channel","provider","instance_name","identifier",
            "status","health","last_activity_at","error_count","reconnect_count","source",
          ] as const;
          const { data, error } = await (supabase.from("connection_health_snapshots") as any)
            .select(cols.join(","))
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(EXPORT_MAX_ROWS);
          if (error) throw error;
          rowCount = (data ?? []).length;
          csv = rowsToCsv((data ?? []) as any[], cols as unknown as string[]);
          filename = `conexoes-${exportPeriod}-${stamp}.csv`;
        } else {
          const cols = [
            "created_at","company_id","connection_id","channel","provider","instance_name","identifier",
            "inbound_count_24h","outbound_count_24h","failed_count_24h","pending_count_24h",
            "last_inbound_at","last_outbound_at","last_webhook_at","health","source",
          ] as const;
          const { data, error } = await (supabase.from("connection_message_flow_snapshots") as any)
            .select(cols.join(","))
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(EXPORT_MAX_ROWS);
          if (error) throw error;
          rowCount = (data ?? []).length;
          csv = rowsToCsv((data ?? []) as any[], cols as unknown as string[]);
          filename = `fluxo-${exportPeriod}-${stamp}.csv`;
        }

        downloadCsv(filename, csv);
        toast({
          title: "Exportação concluída",
          description:
            rowCount >= EXPORT_MAX_ROWS
              ? `Exportação limitada aos ${EXPORT_MAX_ROWS} registros mais recentes.`
              : `${rowCount} registro(s) exportado(s).`,
        });
      } catch (e: any) {
        toast({
          title: "Falha na exportação",
          description: e?.message ?? "Não foi possível exportar agora.",
          variant: "destructive",
        });
      } finally {
        setExporting(null);
      }
    },
    [exportPeriod],
  );


  return (
    <MasterLayout title="Monitoramento Operacional">
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Monitoramento Operacional</h2>
            <p className="text-sm text-muted-foreground">
              Saúde dos canais, provedores e conexões do Dominus.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {live && (
              <span className="text-xs text-muted-foreground">
                Última verificação: {fmtDate(live.checked_at)}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={liveLoading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-2 ${liveLoading ? "animate-spin" : ""}`} />
              Atualizar status
            </Button>
          </div>
        </div>

        {liveError && (
          <Card className="p-3 border-amber-500/40 bg-amber-500/10 text-amber-700 text-sm">
            Não foi possível consultar o status real da Evolution agora. Exibindo dados persistidos.
          </Card>
        )}

        {/* Configurações do monitoramento */}
        {(() => {
          const nowMs = Date.now();
          const lastCronEvoMs = configStats?.lastCronEvo
            ? new Date(configStats.lastCronEvo).getTime()
            : null;
          const cronAgeMin =
            lastCronEvoMs != null ? (nowMs - lastCronEvoMs) / 60000 : null;
          let cronLabel = "Desconhecido";
          let cronTone = "bg-zinc-500/15 text-zinc-600 border-zinc-500/30";
          if (cronAgeMin != null) {
            if (cronAgeMin <= 3) {
              cronLabel = "Ativo";
              cronTone = "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
            } else if (cronAgeMin <= 15) {
              cronLabel = "Atenção";
              cronTone = "bg-amber-500/15 text-amber-600 border-amber-500/30";
            } else {
              cronLabel = "Inativo";
              cronTone = "bg-red-500/15 text-red-600 border-red-500/30";
            }
          }
          const evoOnline = live?.online === true;
          const vpsHealth = vps?.health ?? "unknown";
          const vpsConfigured = vps?.configured === true || configStats?.vpsConfigured === true;
          const vpsLabel = !vpsConfigured
            ? "Não configurada"
            : vpsHealth === "healthy"
              ? "Saudável"
              : vpsHealth === "warning"
                ? "Atenção"
                : vpsHealth === "critical"
                  ? "Crítico"
                  : vpsHealth === "offline"
                    ? "Offline"
                    : "Desconhecido";
          const vpsTone = !vpsConfigured
            ? "bg-zinc-500/15 text-zinc-600 border-zinc-500/30"
            : vpsHealth === "healthy"
              ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
              : vpsHealth === "warning"
                ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
                : vpsHealth === "critical"
                  ? "bg-red-500/15 text-red-600 border-red-500/30"
                  : "bg-zinc-500/15 text-zinc-600 border-zinc-500/30";
          const Item = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
              {tone ? (
                <Badge variant="outline" className={tone}>{value}</Badge>
              ) : (
                <p className="text-sm font-medium">{value}</p>
              )}
            </div>
          );
          return (
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-base font-semibold">Configurações do monitoramento</h3>
                  <p className="text-xs text-muted-foreground">
                    Visão geral do estado da coleta automática e dos serviços monitorados.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={liveLoading}
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-2 ${liveLoading ? "animate-spin" : ""}`} />
                  Testar agora
                </Button>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Item label="Coleta automática" value="Ativa" tone="bg-emerald-500/15 text-emerald-600 border-emerald-500/30" />
                <Item label="Intervalo de coleta" value="1 minuto" />
                <Item label="Retenção" value="30 dias" />
                <Item label="Cron" value={cronLabel} tone={cronTone} />
                <Item
                  label="Evolution API"
                  value={evoOnline ? "Online" : "Offline"}
                  tone={
                    evoOnline
                      ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                      : "bg-red-500/15 text-red-600 border-red-500/30"
                  }
                />
                <Item label="VPS" value={vpsLabel} tone={vpsTone} />
                <Item
                  label="Endpoint VPS"
                  value={vpsConfigured ? "Configurado" : "Não configurado"}
                  tone={
                    vpsConfigured
                      ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                      : "bg-zinc-500/15 text-zinc-600 border-zinc-500/30"
                  }
                />
                <Item
                  label="Última coleta automática"
                  value={fmtDate(configStats?.lastCronEvo ?? null)}
                />
                <Item
                  label="Última atualização manual"
                  value={fmtDate(configStats?.lastManualEvo ?? null)}
                />
                <Item
                  label="Última coleta VPS (cron)"
                  value={fmtDate(configStats?.lastCronInfra ?? null)}
                />
                <Item
                  label="Snapshots Evolution 24h"
                  value={`${configStats?.evoCount24h ?? 0} (falhas: ${configStats?.evoFails24h ?? 0})`}
                />
                <Item
                  label="Snapshots VPS 24h"
                  value={`${configStats?.infraCount24h ?? 0} (falhas: ${configStats?.infraFails24h ?? 0})`}
                />
              </div>
            </Card>
          );
        })()}


        {/* Fase 2.11 — Exportar histórico (CSV) */}
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-semibold">Exportar histórico</h3>
              <p className="text-xs text-muted-foreground">
                Baixe o histórico operacional em CSV. Apenas métricas seguras — sem secrets, tokens ou payload bruto. Limite de {EXPORT_MAX_ROWS.toLocaleString("pt-BR")} linhas por arquivo.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Período:</span>
              {(["1h", "6h", "24h"] as ExportPeriod[]).map((p) => (
                <Button
                  key={p}
                  variant={exportPeriod === p ? "default" : "outline"}
                  size="sm"
                  onClick={() => setExportPeriod(p)}
                >
                  {p === "1h" ? "Última 1h" : p === "6h" ? "Últimas 6h" : "Últimas 24h"}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {([
              { k: "evolution" as const, label: "Evolution" },
              { k: "vps" as const, label: "VPS" },
              { k: "connections" as const, label: "Conexões" },
              { k: "flow" as const, label: "Fluxo de mensagens" },
            ]).map((opt) => (
              <Button
                key={opt.k}
                variant="outline"
                size="sm"
                onClick={() => handleExportCsv(opt.k)}
                disabled={exporting !== null}
                className="justify-start"
              >
                <Download className={`w-3.5 h-3.5 mr-2 ${exporting === opt.k ? "animate-pulse" : ""}`} />
                Baixar CSV — {opt.label}
              </Button>
            ))}
          </div>
        </Card>

        {/* Fase 2.12 — Resumo operacional (7/30 dias) */}
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-semibold">Resumo operacional</h3>
              <p className="text-xs text-muted-foreground">
                Visão agregada dos últimos {aggPeriod} dias. Atualizado a partir dos snapshots persistidos.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Período:</span>
              {([7, 30] as AggPeriod[]).map((d) => (
                <Button
                  key={d}
                  variant={aggPeriod === d ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAggPeriod(d)}
                >
                  Últimos {d} dias
                </Button>
              ))}
            </div>
          </div>
          {aggLoading ? (
            <p className="text-xs text-muted-foreground">Carregando agregados…</p>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                {[
                  { label: "Disponibilidade Evolution", value: aggEvo?.online_pct != null ? `${aggEvo.online_pct}%` : "—" },
                  { label: "Latência média", value: aggEvo?.avg_latency_ms != null ? `${aggEvo.avg_latency_ms} ms` : "—" },
                  { label: "CPU média", value: aggVps?.avg_cpu != null ? `${aggVps.avg_cpu}%` : "—" },
                  { label: "Memória média", value: aggVps?.avg_memory != null ? `${aggVps.avg_memory}%` : "—" },
                  { label: "Disco médio", value: aggVps?.avg_disk != null ? `${aggVps.avg_disk}%` : "—" },
                  { label: "Mensagens recebidas", value: aggFlow?.total_inbound != null ? Number(aggFlow.total_inbound).toLocaleString("pt-BR") : "—" },
                  { label: "Mensagens enviadas", value: aggFlow?.total_outbound != null ? Number(aggFlow.total_outbound).toLocaleString("pt-BR") : "—" },
                  { label: "Falhas de envio", value: aggFlow?.total_failed != null ? Number(aggFlow.total_failed).toLocaleString("pt-BR") : "—" },
                  { label: "Pendentes", value: aggFlow?.total_pending != null ? Number(aggFlow.total_pending).toLocaleString("pt-BR") : "—" },
                  { label: "Snapshots Evolution", value: aggEvo?.total_snapshots != null ? Number(aggEvo.total_snapshots).toLocaleString("pt-BR") : "—" },
                  { label: "Snapshots VPS saudáveis", value: aggVps?.healthy_pct != null ? `${aggVps.healthy_pct}%` : "—" },
                  { label: "Conexões instáveis", value: aggTopConn.filter((c: any) => Number(c.offline_count) > 0).length.toString() },
                ].map((c) => (
                  <Card key={c.label} className="p-3">
                    <p className="text-[11px] text-muted-foreground">{c.label}</p>
                    <p className="text-lg font-semibold mt-1">{c.value}</p>
                  </Card>
                ))}
              </div>

              <div className="mt-5">
                <h4 className="text-sm font-semibold mb-2">Top conexões com atenção</h4>
                {aggTopConn.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma conexão com ocorrências relevantes no período.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-muted-foreground border-b">
                        <tr>
                          <th className="text-left py-2 px-2">Conexão</th>
                          <th className="text-left py-2 px-2">Canal</th>
                          <th className="text-left py-2 px-2">Provedor</th>
                          <th className="text-right py-2 px-2">Quedas (offline)</th>
                          <th className="text-right py-2 px-2">Erros</th>
                          <th className="text-right py-2 px-2">Snapshots</th>
                          <th className="text-left py-2 px-2">Último evento</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aggTopConn.map((c: any) => (
                          <tr key={c.connection_id} className="border-b last:border-0">
                            <td className="py-2 px-2 font-medium">{c.instance_name ?? c.identifier ?? "—"}</td>
                            <td className="py-2 px-2">{c.channel ?? "—"}</td>
                            <td className="py-2 px-2">{c.provider ?? "—"}</td>
                            <td className="py-2 px-2 text-right">{Number(c.offline_count).toLocaleString("pt-BR")}</td>
                            <td className="py-2 px-2 text-right">{Number(c.error_count).toLocaleString("pt-BR")}</td>
                            <td className="py-2 px-2 text-right">{Number(c.total_snapshots).toLocaleString("pt-BR")}</td>
                            <td className="py-2 px-2">{c.last_event_at ? new Date(c.last_event_at).toLocaleString("pt-BR") : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </Card>

        {/* Fase 2.13 — Logs do monitoramento */}
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-semibold">Logs do monitoramento</h3>
              <p className="text-xs text-muted-foreground">
                Eventos do próprio monitoramento (cron, coleta, alertas). Não contém secrets, tokens ou payload bruto. Retenção de 30 dias.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { k: "todos", label: "Todos" },
                { k: "info", label: "Informação" },
                { k: "warning", label: "Atenção" },
                { k: "critical", label: "Crítico" },
                { k: "evolution", label: "Evolution" },
                { k: "vps", label: "VPS" },
                { k: "connection", label: "Conexões" },
                { k: "flow", label: "Fluxo" },
                { k: "cron", label: "Cron" },
              ].map((f) => (
                <Button
                  key={f.k}
                  variant={logsFilter === f.k ? "default" : "outline"}
                  size="sm"
                  onClick={() => setLogsFilter(f.k)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </div>
          {logsLoading ? (
            <p className="text-xs text-muted-foreground">Carregando logs…</p>
          ) : (() => {
            const filtered = logs.filter((l) => {
              if (logsFilter === "todos") return true;
              if (["info", "warning", "critical"].includes(logsFilter)) return l.severity === logsFilter;
              return (l.event_type ?? "").toLowerCase().includes(logsFilter)
                || (l.source ?? "").toLowerCase().includes(logsFilter)
                || (l.provider ?? "").toLowerCase().includes(logsFilter);
            });
            if (filtered.length === 0) {
              return <p className="text-xs text-muted-foreground">Nenhum evento registrado para o filtro selecionado.</p>;
            }
            return (
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground border-b sticky top-0 bg-background">
                    <tr>
                      <th className="text-left py-2 px-2">Data/hora</th>
                      <th className="text-left py-2 px-2">Severidade</th>
                      <th className="text-left py-2 px-2">Tipo</th>
                      <th className="text-left py-2 px-2">Origem</th>
                      <th className="text-left py-2 px-2">Título</th>
                      <th className="text-left py-2 px-2">Descrição</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((l) => (
                      <tr key={l.id} className="border-b last:border-0 align-top">
                        <td className="py-2 px-2 whitespace-nowrap">{new Date(l.created_at).toLocaleString("pt-BR")}</td>
                        <td className="py-2 px-2">
                          <Badge variant="outline" className={severityClasses(l.severity as any)}>
                            {severityLabel(l.severity as any)}
                          </Badge>
                        </td>
                        <td className="py-2 px-2">{l.event_type}</td>
                        <td className="py-2 px-2">{l.source}{l.provider ? ` · ${l.provider}` : ""}</td>
                        <td className="py-2 px-2 font-medium">{l.title}</td>
                        <td className="py-2 px-2 text-muted-foreground">{l.description ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </Card>



        {/* Cards de resumo */}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {cards.map((c) => (
            <Card key={c.label} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                  <p className="text-2xl font-bold mt-1">{c.value}</p>
                </div>
                <div className={`p-2 rounded-lg ${c.tone}`}>
                  <c.icon className="w-4 h-4" />
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Alertas operacionais */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Alertas operacionais
            </h3>
          </div>
          {alerts.length === 0 ? (
            <Card className="p-5 flex items-center gap-3 border-emerald-500/30 bg-emerald-500/5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <div>
                <p className="text-sm font-medium text-emerald-700">Tudo certo no momento</p>
                <p className="text-xs text-muted-foreground">
                  Nenhum problema operacional detectado na última verificação.
                </p>
              </div>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {alerts.map((a) => (
                <Card key={a.id} className={`p-4 border ${severityClasses(a.severity)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className={severityClasses(a.severity)}>
                          {severityLabel(a.severity)}
                        </Badge>
                        {a.scope && (
                          <span className="text-xs text-muted-foreground truncate">{a.scope}</span>
                        )}
                      </div>
                      <p className="text-sm font-semibold leading-tight">{a.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{a.description}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {fmtDate(a.detectedAt)}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          )}
          {history.length < 4 && (
            <p className="text-xs text-muted-foreground mt-2">
              Dados históricos insuficientes para detectar oscilação.
            </p>
          )}
        </div>



        {/* Provedores */}
        <div>
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">
            Provedores
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-primary" />
                  <h4 className="font-semibold">Evolution API</h4>
                </div>
                <Badge variant="outline" className={healthColor(evoProviderHealth)}>
                  {healthLabel(evoProviderHealth)}
                </Badge>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">Status</dt>
                <dd className={`text-right font-medium ${live ? (live.online ? "text-emerald-600" : "text-red-600") : "text-muted-foreground"}`}>
                  {live ? (live.online ? "Online" : "Offline") : liveLoading ? "Verificando..." : "—"}
                </dd>
                <dt className="text-muted-foreground">Latência</dt>
                <dd className="text-right font-medium">
                  {live?.response_time_ms != null ? `${live.response_time_ms} ms` : "—"}
                </dd>
                <dt className="text-muted-foreground">Última verificação</dt>
                <dd className="text-right text-xs text-muted-foreground">
                  {live ? fmtDate(live.checked_at) : "—"}
                </dd>
                <dt className="text-muted-foreground">Total de instâncias</dt>
                <dd className="text-right font-medium">{evoStats.total}</dd>
                <dt className="text-muted-foreground">Conectadas</dt>
                <dd className="text-right font-medium text-emerald-600">{evoStats.connected}</dd>
                <dt className="text-muted-foreground">Desconectadas</dt>
                <dd className="text-right font-medium text-zinc-600">{evoStats.disconnected}</dd>
                <dt className="text-muted-foreground">Com erro</dt>
                <dd className="text-right font-medium text-red-600">{evoStats.errors}</dd>
              </dl>
              {live?.error && (
                <p className="text-xs text-red-600 mt-3">Erro: {live.error}</p>
              )}
              {!live && !liveLoading && (
                <p className="text-xs text-muted-foreground mt-3">
                  Exibindo dados persistidos. Clique em “Atualizar status” para checar a Evolution agora.
                </p>
              )}

            </Card>

            <Card className="p-5 opacity-80">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-primary" />
                  <h4 className="font-semibold">Meta API</h4>
                </div>
                <Badge variant="outline">Em breve</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-3">
                Instagram e Facebook Messenger via Meta Cloud API. Planejado para fase futura.
              </p>
            </Card>

            <Card className="p-5 opacity-80">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-primary" />
                  <h4 className="font-semibold">E-mail IMAP/SMTP</h4>
                </div>
                <Badge variant="outline">Planejado</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-3">
                Monitoramento de caixas IMAP/SMTP por empresa. Estrutura preparada.
              </p>
            </Card>
          </div>
        </div>

        {/* Infraestrutura / VPS */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Server className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Infraestrutura
            </h3>
          </div>

          {!vps || !vps.configured ? (
            <Card className="p-5 text-sm text-muted-foreground">
              Monitoramento da VPS ainda não configurado.
            </Card>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <Card className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">VPS</p>
                      <p className="text-base font-semibold mt-1">
                        {vps.hostname ?? "—"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        vps.health === "healthy"
                          ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                          : vps.health === "warning"
                            ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
                            : vps.health === "critical"
                              ? "bg-red-500/15 text-red-600 border-red-500/30"
                              : "bg-zinc-500/15 text-zinc-600 border-zinc-500/30"
                      }
                    >
                      {vps.health === "healthy"
                        ? "Saudável"
                        : vps.health === "warning"
                          ? "Atenção"
                          : vps.health === "critical"
                            ? "Crítico"
                            : vps.health === "offline"
                              ? "Offline"
                              : "Desconhecido"}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-3">
                    Última verificação: {fmtDate(vps.checked_at)}
                  </p>
                  {vps.error && (
                    <p className="text-[11px] text-red-600 mt-1">Erro: {vps.error}</p>
                  )}
                </Card>

                <Card className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">CPU</p>
                      <p className="text-2xl font-bold mt-1">
                        {vps.cpu_percent != null ? `${Math.round(vps.cpu_percent)}%` : "—"}
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      <Cpu className="w-4 h-4" />
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Memória</p>
                      <p className="text-2xl font-bold mt-1">
                        {vps.memory_percent != null ? `${Math.round(vps.memory_percent)}%` : "—"}
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      <MemoryStick className="w-4 h-4" />
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Disco</p>
                      <p className="text-2xl font-bold mt-1">
                        {vps.disk_percent != null ? `${Math.round(vps.disk_percent)}%` : "—"}
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      <HardDrive className="w-4 h-4" />
                    </div>
                  </div>
                  {vps.load_average != null && (
                    <p className="text-[11px] text-muted-foreground mt-2">
                      Load average: {vps.load_average.toFixed(2)}
                    </p>
                  )}
                </Card>

                <Card className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Uptime</p>
                      <p className="text-2xl font-bold mt-1">
                        {formatUptime(vps.uptime_seconds)}
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      <Timer className="w-4 h-4" />
                    </div>
                  </div>
                </Card>
              </div>

              {infraHistory.length === 0 ? (
                <Card className="p-5 mt-4 text-center text-sm text-muted-foreground">
                  Ainda não há dados históricos suficientes da infraestrutura.
                </Card>
              ) : (
                <Card className="p-4 mt-4">
                  <h4 className="text-sm font-semibold mb-3">CPU · Memória · Disco (%)</h4>
                  <div style={{ width: "100%", height: 240 }}>
                    <ResponsiveContainer>
                      <LineChart
                        data={infraHistory.map((s) => ({
                          t: new Date(s.created_at).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          }),
                          CPU: s.cpu_percent ?? null,
                          Memória: s.memory_percent ?? null,
                          Disco: s.disk_percent ?? null,
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="t" fontSize={11} />
                        <YAxis fontSize={11} domain={[0, 100]} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="CPU" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="Memória" stroke="hsl(38 92% 50%)" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="Disco" stroke="hsl(142 71% 45%)" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>


        {/* Histórico da Evolution */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <LineChartIcon className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Histórico da Evolution
              </h3>
            </div>
            <div className="flex items-center gap-1">
              {(["1h", "6h", "24h"] as HistoryPeriod[]).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={period === p ? "default" : "outline"}
                  onClick={() => setPeriod(p)}
                  disabled={historyLoading}
                >
                  {p === "1h" ? "Última 1h" : p === "6h" ? "Últimas 6h" : "Últimas 24h"}
                </Button>
              ))}
            </div>
          </div>

          {history.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              {historyLoading
                ? "Carregando histórico..."
                : "Ainda não há dados históricos suficientes. Clique em “Atualizar status” para registrar um snapshot."}
            </Card>
          ) : (
            <div className="grid lg:grid-cols-2 gap-4">
              <Card className="p-4">
                <h4 className="text-sm font-semibold mb-3">Latência (ms)</h4>
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <LineChart
                      data={history.map((s) => ({
                        t: new Date(s.created_at).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        }),
                        latency: s.response_time_ms ?? 0,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="t" fontSize={11} />
                      <YAxis fontSize={11} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="latency"
                        name="Latência (ms)"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="p-4">
                <h4 className="text-sm font-semibold mb-3">Instâncias conectadas x desconectadas</h4>
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <BarChart
                      data={history.map((s) => ({
                        t: new Date(s.created_at).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        }),
                        Conectadas: s.connected_instances,
                        Desconectadas: s.disconnected_instances,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="t" fontSize={11} />
                      <YAxis fontSize={11} allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="Conectadas" fill="hsl(142 71% 45%)" />
                      <Bar dataKey="Desconectadas" fill="hsl(0 0% 60%)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          )}
          {/* Pendência Fase futura: retenção automática de snapshots por 7/15/30 dias e cron de coleta. */}
        </div>



        {/* Tabela de conexões */}
        <Card className="overflow-hidden">
          <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Conexões e canais</h3>
              <p className="text-xs text-muted-foreground">
                Visão multicanal consolidada por empresa.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {([
                ["all", "Todas"],
                ["healthy", "Saudáveis"],
                ["warning", "Atenção"],
                ["critical", "Críticas"],
                ["offline", "Offline"],
              ] as [HealthFilter, string][]).map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  variant={healthFilter === key ? "default" : "outline"}
                  onClick={() => setHealthFilter(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Empresa</th>
                  <th className="text-left px-4 py-2 font-medium">Canal</th>
                  <th className="text-left px-4 py-2 font-medium">Provedor</th>
                  <th className="text-left px-4 py-2 font-medium">Conexão</th>
                  <th className="text-left px-4 py-2 font-medium">Identificador</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">Saúde</th>
                  <th className="text-left px-4 py-2 font-medium">Estabilidade</th>
                  <th className="text-left px-4 py-2 font-medium">Fluxo</th>
                  <th className="text-right px-4 py-2 font-medium">Falhas 24h</th>
                  <th className="text-left px-4 py-2 font-medium">Última atividade</th>
                  <th className="text-right px-4 py-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-10 text-center text-muted-foreground">
                      Carregando...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-10 text-center text-muted-foreground">
                      Nenhuma conexão para o filtro selecionado.
                    </td>
                  </tr>

                ) : (
                  filteredRows.map((r) => {
                    const Icon = channelIcon(r.channelType);
                    const info = stabilityByRow.get(r.id);
                    const flow = flowByRow.get(r.id) ?? null;
                    const diag = computeFlowDiagnosis(
                      {
                        id: r.id, companyName: r.companyName, channelType: r.channelType,
                        provider: r.provider, name: r.name, health: r.health, status: r.status,
                        lastActivityAt: r.lastActivityAt, lastError: r.lastError,
                      },
                      flow,
                    );
                    return (
                      <tr key={r.id} className={`border-t hover:bg-muted/30 ${rowHighlight(r.health, r.status)}`}>
                        <td className="px-4 py-2">{r.companyName}</td>
                        <td className="px-4 py-2">
                          <span className="inline-flex items-center gap-1.5">
                            <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                            {channelTypeLabel(r.channelType)}
                          </span>
                        </td>
                        <td className="px-4 py-2">{providerLabel(r.provider)}</td>
                        <td className="px-4 py-2">{r.name}</td>
                        <td className="px-4 py-2 font-mono text-xs">{r.identifier}</td>
                        <td className="px-4 py-2">
                          <Badge variant="outline">
                            {statusLabel(r.status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-2">
                          <Badge variant="outline" className={healthColor(r.health)}>
                            {healthLabel(r.health)}
                          </Badge>
                        </td>
                        <td className="px-4 py-2">
                          <Badge
                            variant="outline"
                            className={stabilityClasses(info?.stability ?? "unknown")}
                          >
                            {stabilityLabel(info?.stability ?? "unknown")}
                          </Badge>
                        </td>
                        <td className="px-4 py-2">
                          <Badge variant="outline" className={flowHealthClasses(diag.health)}>
                            {flowHealthLabel(diag.health)}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-right">
                          {flow ? (
                            <span className={flow.failed_24h > 0 ? "text-red-600 font-medium" : "text-muted-foreground"}>
                              {flow.failed_24h}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          <div>{formatAgo(r.lastActivityAt)}</div>
                          <div className="text-[10px] opacity-70">{fmtDate(r.lastActivityAt)}</div>
                        </td>

                        <td className="px-4 py-2 text-right">
                          <Button variant="ghost" size="sm" onClick={() => setSelected(r)}>
                            Ver detalhes
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Drawer de detalhes */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Detalhes da conexão</SheetTitle>
            <SheetDescription>
              Informações operacionais. Tokens e segredos não são exibidos.
            </SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="mt-6 space-y-4 text-sm">
              <Field label="Empresa" value={selected.companyName} />
              <Field label="Canal" value={channelTypeLabel(selected.channelType)} />
              <Field label="Provedor" value={providerLabel(selected.provider)} />
              <Field label="Nome da conexão" value={selected.name} />
              <Field label="Identificador" value={selected.identifier} mono />
              <Field label="Status" value={statusLabel(selected.status)} />
              <Field label="Saúde" value={healthLabel(selected.health)} />
              <Field label="Última atividade" value={fmtDate(selected.lastActivityAt)} />
              <Field
                label="Última atualização"
                value={fmtDate((selected.raw as any)?.updated_at ?? null)}
              />
              <Field label="Último erro" value={selected.lastError ?? "Nenhum"} />

              <div className="mt-4 pt-4 border-t">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Histórico e estabilidade
                </h4>
                {(() => {
                  const info =
                    stabilityByRow.get(selected.id) ?? {
                      stability: "unknown" as const,
                      transitions: 0,
                      connectedDisconnectedFlips: 0,
                      sampleSize: 0,
                      recentStates: [],
                    };
                  const conn = {
                    id: selected.id,
                    companyName: selected.companyName,
                    channelType: selected.channelType,
                    provider: selected.provider,
                    name: selected.name,
                    health: selected.health,
                    status: selected.status,
                    lastActivityAt: selected.lastActivityAt,
                    lastError: selected.lastError,
                  };
                  return (
                    <>
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <Badge variant="outline" className={healthColor(selected.health)}>
                          {healthLabel(selected.health)}
                        </Badge>
                        <Badge variant="outline">{statusLabel(selected.status)}</Badge>
                        <Badge variant="outline" className={stabilityClasses(info.stability)}>
                          {stabilityLabel(info.stability)}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                        <div className="text-muted-foreground">Sem atividade há</div>
                        <div className="text-right">{formatAgo(selected.lastActivityAt)}</div>
                        <div className="text-muted-foreground">Snapshots recentes</div>
                        <div className="text-right">{info.sampleSize}</div>
                        <div className="text-muted-foreground">Mudanças de estado</div>
                        <div className="text-right">{info.transitions}</div>
                        <div className="text-muted-foreground">Quedas/reconexões</div>
                        <div className="text-right">{info.connectedDisconnectedFlips}</div>
                      </div>
                      {info.recentStates.length > 0 ? (
                        <div className="rounded-md border bg-muted/30 p-3 text-xs mb-3">
                          <p className="font-medium mb-1 text-foreground">Últimos estados</p>
                          <p className="text-muted-foreground break-words">
                            {info.recentStates.map(statusLabelPt).join(" → ")}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground mb-3">
                          Dados históricos insuficientes para diagnóstico.
                        </p>
                      )}
                      <div className="rounded-md border bg-muted/30 p-3 text-xs leading-relaxed">
                        <p className="font-medium mb-1 text-foreground">Recomendação</p>
                        <p className="text-muted-foreground">
                          {recommendationForConnection(conn, info)}
                        </p>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Fluxo de mensagens (Fase 2.8) */}
              <div className="mt-4 pt-4 border-t">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Fluxo de mensagens
                </h4>
                {(() => {
                  const flow = flowByRow.get(selected.id) ?? null;
                  const conn = {
                    id: selected.id, companyName: selected.companyName, channelType: selected.channelType,
                    provider: selected.provider, name: selected.name, health: selected.health,
                    status: selected.status, lastActivityAt: selected.lastActivityAt, lastError: selected.lastError,
                  };
                  const diag = computeFlowDiagnosis(conn, flow);
                  if (!flow) {
                    return (
                      <p className="text-xs text-muted-foreground">
                        Sem dados suficientes para diagnóstico.
                      </p>
                    );
                  }
                  return (
                    <>
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <Badge variant="outline" className={flowHealthClasses(diag.health)}>
                          {flowHealthLabel(diag.health)}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                        <div className="text-muted-foreground">Último webhook</div>
                        <div className="text-right">{formatAgo(flow.last_webhook_at)}</div>
                        <div className="text-muted-foreground">Última recebida</div>
                        <div className="text-right">{formatAgo(flow.last_inbound_at)}</div>
                        <div className="text-muted-foreground">Última enviada</div>
                        <div className="text-right">{formatAgo(flow.last_outbound_at)}</div>
                        <div className="text-muted-foreground">Recebidas 24h</div>
                        <div className="text-right">{flow.inbound_24h}</div>
                        <div className="text-muted-foreground">Enviadas 24h</div>
                        <div className="text-right">{flow.outbound_24h}</div>
                        <div className="text-muted-foreground">Falhas 24h</div>
                        <div className={`text-right ${flow.failed_24h > 0 ? "text-red-600 font-medium" : ""}`}>
                          {flow.failed_24h}
                        </div>
                        <div className="text-muted-foreground">Pendentes 24h</div>
                        <div className="text-right">{flow.pending_24h}</div>
                      </div>
                      <div className="rounded-md border bg-muted/30 p-3 text-xs leading-relaxed">
                        <p className="font-medium mb-1 text-foreground">Diagnóstico</p>
                        <p className="text-muted-foreground">{diag.diagnosis}</p>
                      </div>
                    </>
                  );
                })()}

                {/* Phase 2.9: histórico do fluxo */}
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-foreground">Histórico do fluxo</p>
                    <div className="flex items-center gap-1">
                      {(["1h", "6h", "24h"] as HistoryPeriod[]).map((p) => (
                        <Button
                          key={p}
                          size="sm"
                          variant={flowHistoryPeriod === p ? "default" : "outline"}
                          className="h-6 px-2 text-[10px]"
                          onClick={() => setFlowHistoryPeriod(p)}
                        >
                          {p === "1h" ? "1h" : p === "6h" ? "6h" : "24h"}
                        </Button>
                      ))}
                    </div>
                  </div>
                  {flowHistoryLoading ? (
                    <p className="text-xs text-muted-foreground">Carregando histórico...</p>
                  ) : flowHistory.length < 2 ? (
                    <p className="text-xs text-muted-foreground">
                      Ainda não há dados históricos suficientes.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1">
                          Recebidas x Enviadas (acumulado 24h por snapshot)
                        </p>
                        <div className="h-32">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                              data={flowHistory.map((s) => ({
                                t: new Date(s.created_at).toLocaleTimeString("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }),
                                Recebidas: s.inbound_count_24h,
                                Enviadas: s.outbound_count_24h,
                              }))}
                            >
                              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                              <XAxis dataKey="t" fontSize={9} />
                              <YAxis fontSize={9} allowDecimals={false} />
                              <Tooltip />
                              <Legend wrapperStyle={{ fontSize: 10 }} />
                              <Line type="monotone" dataKey="Recebidas" stroke="#10b981" dot={false} />
                              <Line type="monotone" dataKey="Enviadas" stroke="#3b82f6" dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1">
                          Falhas e Pendentes (acumulado 24h por snapshot)
                        </p>
                        <div className="h-32">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={flowHistory.map((s) => ({
                                t: new Date(s.created_at).toLocaleTimeString("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }),
                                Falhas: s.failed_count_24h,
                                Pendentes: s.pending_count_24h,
                              }))}
                            >
                              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                              <XAxis dataKey="t" fontSize={9} />
                              <YAxis fontSize={9} allowDecimals={false} />
                              <Tooltip />
                              <Legend wrapperStyle={{ fontSize: 10 }} />
                              <Bar dataKey="Falhas" fill="#ef4444" />
                              <Bar dataKey="Pendentes" fill="#f59e0b" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </SheetContent>
      </Sheet>
    </MasterLayout>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
