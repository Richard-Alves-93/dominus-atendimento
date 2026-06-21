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
    facebook: "Facebook",
    email: "E-mail",
    telegram: "Telegram",
  };
  return map[t] ?? t;
};

const providerLabel = (p: string) => {
  const map: Record<string, string> = {
    evolution: "Evolution",
    evogo: "EvoGo",
    meta: "Meta",
    imap_smtp: "IMAP/SMTP",
    manual: "Manual",
  };
  return map[p] ?? p;
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
      for (const c of (data?.connections ?? []) as any[]) {
        if (c?.provider === "evolution" && c?.instance_name && c?.live_checked) {
          map[c.instance_name] = c.status as OpStatus;
        }
      }
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
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadPersisted, loadLive]);

  useEffect(() => {
    loadHistory(period);
  }, [period, loadHistory]);

  const handleRefresh = async () => {
    await loadLive(true);
    await loadHistory(period);
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


  const cards = [
    { label: "Total de conexões", value: summary.total, icon: PlugZap, tone: "bg-primary/10 text-primary" },
    { label: "Saudáveis", value: summary.healthy, icon: CheckCircle2, tone: "bg-emerald-500/15 text-emerald-600" },
    { label: "Com alerta", value: summary.warning, icon: AlertTriangle, tone: "bg-amber-500/15 text-amber-600" },
    { label: "Offline", value: summary.offline, icon: PowerOff, tone: "bg-zinc-500/15 text-zinc-600" },
    { label: "Críticas", value: summary.critical, icon: Activity, tone: "bg-red-500/15 text-red-600" },
    { label: "Empresas com alerta", value: summary.companiesWithAlert, icon: Server, tone: "bg-primary/10 text-primary" },
  ];

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

        {/* Tabela de conexões */}
        <Card className="overflow-hidden">
          <div className="p-4 border-b">
            <h3 className="font-semibold">Conexões e canais</h3>
            <p className="text-xs text-muted-foreground">
              Visão multicanal consolidada por empresa.
            </p>
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
                  <th className="text-left px-4 py-2 font-medium">Última atividade</th>
                  <th className="text-right px-4 py-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                      Carregando...
                    </td>
                  </tr>
                ) : mergedRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                      Nenhuma conexão registrada.
                    </td>
                  </tr>
                ) : (
                  mergedRows.map((r) => {
                    const Icon = channelIcon(r.channelType);
                    return (
                      <tr key={r.id} className="border-t hover:bg-muted/30">
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
                        <td className="px-4 py-2 text-muted-foreground">
                          {fmtDate(r.lastActivityAt)}
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
