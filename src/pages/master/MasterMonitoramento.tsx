import { useEffect, useMemo, useState } from "react";
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
  Activity,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [channelsRes, instancesRes, companiesRes] = await Promise.all([
        (supabase.from("channels") as any).select(
          "id, company_id, channel_type, channel_provider, name, status, external_id, phone_number, email_address, metadata, updated_at"
        ),
        (supabase.from("whatsapp_instances") as any).select(
          "id, company_id, channel_id, instance_name, phone_number, status, connected_at, disconnected_at, updated_at, settings_sync_error, last_settings_sync_at"
        ),
        (supabase.from("companies") as any).select("id, name"),
      ]);

      if (cancelled) return;

      const companies = new Map<string, string>(
        (companiesRes.data ?? []).map((c: any) => [c.id, c.name])
      );

      const list: ConnectionRow[] = [];

      // WhatsApp via instâncias Evolution (fonte principal nesta fase)
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

      // Outros canais (Meta, e-mail) — estrutura preparada
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
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    const total = rows.length;
    const healthy = rows.filter((r) => r.health === "healthy").length;
    const warning = rows.filter((r) =>
      ["warning", "pending_qr", "pending_auth", "sync_delayed", "rate_limited"].includes(r.health)
    ).length;
    const offline = rows.filter((r) => r.health === "offline" || r.status === "disconnected").length;
    const critical = rows.filter((r) => r.health === "critical").length;
    const companiesWithAlert = new Set(
      rows
        .filter((r) => r.health !== "healthy" && r.companyId)
        .map((r) => r.companyId)
    ).size;
    return { total, healthy, warning, offline, critical, companiesWithAlert };
  }, [rows]);

  const evolutionInstances = rows.filter((r) => r.provider === "evolution");
  const evoStats = {
    total: evolutionInstances.length,
    connected: evolutionInstances.filter((r) => r.status === "connected").length,
    disconnected: evolutionInstances.filter((r) => r.status === "disconnected").length,
    errors: evolutionInstances.filter((r) => r.status === "error").length,
  };
  const evoProviderHealth: Health =
    evoStats.total === 0
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
        <div>
          <h2 className="text-xl font-semibold">Monitoramento Operacional</h2>
          <p className="text-sm text-muted-foreground">
            Saúde dos canais, provedores e conexões do Dominus.
          </p>
        </div>

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
                  {evoProviderHealth}
                </Badge>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">Total de instâncias</dt>
                <dd className="text-right font-medium">{evoStats.total}</dd>
                <dt className="text-muted-foreground">Conectadas</dt>
                <dd className="text-right font-medium text-emerald-600">{evoStats.connected}</dd>
                <dt className="text-muted-foreground">Desconectadas</dt>
                <dd className="text-right font-medium text-zinc-600">{evoStats.disconnected}</dd>
                <dt className="text-muted-foreground">Com erro</dt>
                <dd className="text-right font-medium text-red-600">{evoStats.errors}</dd>
              </dl>
              <p className="text-xs text-muted-foreground mt-3">
                Status consolidado a partir das instâncias persistidas. Verificação em tempo real fica para Fase 2.
              </p>
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
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                      Nenhuma conexão registrada.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const Icon = channelIcon(r.channelType);
                    return (
                      <tr key={r.id} className="border-t hover:bg-muted/30">
                        <td className="px-4 py-2">{r.companyName}</td>
                        <td className="px-4 py-2">
                          <span className="inline-flex items-center gap-1.5">
                            <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                            {r.channelType}
                          </span>
                        </td>
                        <td className="px-4 py-2 capitalize">{r.provider}</td>
                        <td className="px-4 py-2">{r.name}</td>
                        <td className="px-4 py-2 font-mono text-xs">{r.identifier}</td>
                        <td className="px-4 py-2">
                          <Badge variant="outline" className="capitalize">
                            {r.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-2">
                          <Badge variant="outline" className={healthColor(r.health)}>
                            {r.health}
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
              <Field label="Canal" value={selected.channelType} />
              <Field label="Provedor" value={selected.provider} />
              <Field label="Nome da conexão" value={selected.name} />
              <Field label="Identificador" value={selected.identifier} mono />
              <Field label="Status" value={selected.status} />
              <Field label="Saúde" value={selected.health} />
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
