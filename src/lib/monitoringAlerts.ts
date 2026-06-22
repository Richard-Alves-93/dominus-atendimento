// Helpers de diagnóstico visual para o Monitoramento Master.
// Apenas leitura — não chama Evolution, não expõe secrets.

export type AlertSeverity = "critical" | "warning" | "info" | "unknown";

export type OperationalAlert = {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  scope?: string; // ex: "Evolution", "Empresa X / WhatsApp"
  detectedAt: string; // ISO
};

export type EvoLive = {
  checked_at: string;
  online: boolean;
  response_time_ms: number | null;
  total_instances: number;
  connected_instances: number;
  disconnected_instances: number;
  error_instances: number;
  error?: string | null;
} | null;

export type VpsLive = {
  configured: boolean;
  ok: boolean;
  checked_at: string;
  cpu_percent: number | null;
  memory_percent: number | null;
  disk_percent: number | null;
  load_average: number | null;
  uptime_seconds: number | null;
  hostname: string | null;
  health: string;
  response_time_ms?: number | null;
  status?: string;
  error?: string | null;
} | null;

export type SnapshotLite = {
  created_at: string;
  api_online: boolean;
};

export type ConnLite = {
  id: string;
  companyName: string;
  channelType: string;
  provider: string;
  name: string;
  health: string;
  status: string;
  lastActivityAt: string | null;
  lastError: string | null;
};

const now = () => new Date().toISOString();

export function computeEvolutionAlerts(live: EvoLive): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];
  if (!live) return alerts;

  if (!live.online) {
    alerts.push({
      id: "evo-offline",
      severity: "critical",
      title: "Evolution API está offline",
      description: live.error
        ? `O provedor não respondeu. Detalhe: ${live.error}`
        : "O provedor WhatsApp não respondeu na última verificação.",
      scope: "Evolution",
      detectedAt: live.checked_at ?? now(),
    });
  } else if (live.response_time_ms != null) {
    if (live.response_time_ms >= 1500) {
      alerts.push({
        id: "evo-latency-critical",
        severity: "critical",
        title: "Latência crítica na Evolution",
        description: `Tempo de resposta de ${live.response_time_ms} ms (acima de 1500 ms).`,
        scope: "Evolution",
        detectedAt: live.checked_at ?? now(),
      });
    } else if (live.response_time_ms >= 800) {
      alerts.push({
        id: "evo-latency-warning",
        severity: "warning",
        title: "Latência alta na Evolution",
        description: `Tempo de resposta de ${live.response_time_ms} ms (acima de 800 ms).`,
        scope: "Evolution",
        detectedAt: live.checked_at ?? now(),
      });
    }
  }

  if (live.total_instances > 0) {
    const ratio = live.disconnected_instances / live.total_instances;
    if (ratio >= 0.5) {
      alerts.push({
        id: "evo-many-disconnected",
        severity: "critical",
        title: "Mais da metade das instâncias estão desconectadas",
        description: `${live.disconnected_instances} de ${live.total_instances} instâncias offline.`,
        scope: "Evolution",
        detectedAt: live.checked_at ?? now(),
      });
    } else if (live.disconnected_instances > 0) {
      alerts.push({
        id: "evo-some-disconnected",
        severity: "warning",
        title: "Há instâncias desconectadas",
        description: `${live.disconnected_instances} de ${live.total_instances} instâncias offline.`,
        scope: "Evolution",
        detectedAt: live.checked_at ?? now(),
      });
    }
  }

  if (live.error_instances > 0) {
    alerts.push({
      id: "evo-errors",
      severity: "critical",
      title: "Há instâncias com erro",
      description: `${live.error_instances} instância(s) reportando erro.`,
      scope: "Evolution",
      detectedAt: live.checked_at ?? now(),
    });
  }

  return alerts;
}

export function computeOscillationAlert(
  snapshots: SnapshotLite[],
): OperationalAlert | null {
  if (!snapshots || snapshots.length < 4) return null;
  const recent = snapshots.slice(-10);
  let transitions = 0;
  let drops = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].api_online !== recent[i - 1].api_online) {
      transitions++;
      if (recent[i - 1].api_online && !recent[i].api_online) drops++;
    }
  }
  if (drops >= 3) {
    return {
      id: "evo-oscillation-critical",
      severity: "critical",
      title: "Evolution oscilando com várias quedas",
      description: `Detectadas ${drops} quedas nos últimos ${recent.length} snapshots.`,
      scope: "Evolution",
      detectedAt: now(),
    };
  }
  if (transitions >= 2) {
    return {
      id: "evo-oscillation-warning",
      severity: "warning",
      title: "Evolution oscilando",
      description: `${transitions} mudanças de estado nos últimos ${recent.length} snapshots.`,
      scope: "Evolution",
      detectedAt: now(),
    };
  }
  return null;
}

export function computeConnectionAlerts(rows: ConnLite[]): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];
  const HOUR = 60 * 60 * 1000;
  for (const r of rows) {
    const scope = `${r.companyName} · ${r.name}`;
    if (r.health === "critical" || r.status === "error") {
      alerts.push({
        id: `conn-critical-${r.id}`,
        severity: "critical",
        title: "Conexão em estado crítico",
        description: r.lastError
          ? `${scope}: ${r.lastError}`
          : `${scope} está em estado crítico.`,
        scope,
        detectedAt: r.lastActivityAt ?? now(),
      });
    } else if (r.health === "offline" || r.status === "disconnected") {
      alerts.push({
        id: `conn-offline-${r.id}`,
        severity: "warning",
        title: "Conexão offline",
        description: `${scope} está desconectada.`,
        scope,
        detectedAt: r.lastActivityAt ?? now(),
      });
    }

    if (r.lastActivityAt) {
      const ageMs = Date.now() - new Date(r.lastActivityAt).getTime();
      if (ageMs > 72 * HOUR && r.health !== "healthy") {
        alerts.push({
          id: `conn-stale-72-${r.id}`,
          severity: "critical",
          title: "Sem atividade há mais de 72h",
          description: `${scope} sem atividade desde ${new Date(r.lastActivityAt).toLocaleString("pt-BR")}.`,
          scope,
          detectedAt: r.lastActivityAt,
        });
      } else if (ageMs > 24 * HOUR && r.health !== "healthy") {
        alerts.push({
          id: `conn-stale-24-${r.id}`,
          severity: "warning",
          title: "Sem atividade há mais de 24h",
          description: `${scope} sem atividade desde ${new Date(r.lastActivityAt).toLocaleString("pt-BR")}.`,
          scope,
          detectedAt: r.lastActivityAt,
        });
      }
    }
  }
  return alerts;
}

export function severityRank(s: AlertSeverity): number {
  switch (s) {
    case "critical":
      return 0;
    case "warning":
      return 1;
    case "info":
      return 2;
    default:
      return 3;
  }
}

export function severityLabel(s: AlertSeverity): string {
  switch (s) {
    case "critical":
      return "Crítico";
    case "warning":
      return "Atenção";
    case "info":
      return "Informativo";
    default:
      return "Sem dados";
  }
}

export function severityClasses(s: AlertSeverity): string {
  switch (s) {
    case "critical":
      return "bg-red-500/10 text-red-700 border-red-500/40";
    case "warning":
      return "bg-amber-500/10 text-amber-700 border-amber-500/40";
    case "info":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/40";
    default:
      return "bg-zinc-500/10 text-zinc-700 border-zinc-500/40";
  }
}

export function recommendationFor(conn: ConnLite): string {
  if (conn.health === "critical" || conn.status === "error") {
    return "Verifique se a Evolution API está respondendo e se a instância não exige novo QR Code.";
  }
  if (conn.health === "offline" || conn.status === "disconnected") {
    return "Conexão desconectada. Gere um novo QR Code ou reconecte na tela de Conexões.";
  }
  if (conn.health === "pending_qr" || conn.status === "connecting") {
    return "Aguardando leitura do QR Code para conectar.";
  }
  if (conn.health === "healthy") {
    return "Conexão saudável. Nenhuma ação necessária.";
  }
  return "Sem dados suficientes para diagnóstico.";
}

export function computeVpsAlerts(v: VpsLive): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];
  if (!v || !v.configured) return alerts;
  const when = v.checked_at ?? now();
  if (!v.ok) {
    alerts.push({
      id: "vps-offline",
      severity: "critical",
      title: "VPS sem resposta",
      description: v.error ? `Fonte da VPS indisponível: ${v.error}` : "A fonte de métricas da VPS não respondeu.",
      scope: "Infraestrutura",
      detectedAt: when,
    });
    return alerts;
  }
  const push = (id: string, sev: AlertSeverity, title: string, description: string) =>
    alerts.push({ id, severity: sev, title, description, scope: "Infraestrutura", detectedAt: when });

  if (v.cpu_percent != null) {
    if (v.cpu_percent >= 95) push("vps-cpu-critical", "critical", "CPU crítica na VPS", `Uso de CPU em ${v.cpu_percent.toFixed(0)}% (≥ 95%).`);
    else if (v.cpu_percent >= 85) push("vps-cpu-warning", "warning", "CPU alta na VPS", `Uso de CPU em ${v.cpu_percent.toFixed(0)}% (≥ 85%).`);
  }
  if (v.memory_percent != null) {
    if (v.memory_percent >= 95) push("vps-mem-critical", "critical", "Memória crítica na VPS", `Uso de memória em ${v.memory_percent.toFixed(0)}% (≥ 95%).`);
    else if (v.memory_percent >= 85) push("vps-mem-warning", "warning", "Memória alta na VPS", `Uso de memória em ${v.memory_percent.toFixed(0)}% (≥ 85%).`);
  }
  if (v.disk_percent != null) {
    if (v.disk_percent >= 90) push("vps-disk-critical", "critical", "Disco crítico na VPS", `Uso de disco em ${v.disk_percent.toFixed(0)}% (≥ 90%).`);
    else if (v.disk_percent >= 80) push("vps-disk-warning", "warning", "Disco alto na VPS", `Uso de disco em ${v.disk_percent.toFixed(0)}% (≥ 80%).`);
  }
  return alerts;
}

export function formatUptime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.trunc(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ===== Stability per connection =====

export type ConnectionSnapshot = {
  created_at: string;
  status: string;
  health: string;
};

export type Stability = "stable" | "warning" | "unstable" | "critical" | "unknown";

export function stabilityLabel(s: Stability): string {
  switch (s) {
    case "stable": return "Estável";
    case "warning": return "Atenção";
    case "unstable": return "Instável";
    case "critical": return "Crítica";
    default: return "Sem dados";
  }
}

export function stabilityClasses(s: Stability): string {
  switch (s) {
    case "stable": return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
    case "warning": return "bg-amber-500/15 text-amber-600 border-amber-500/30";
    case "unstable": return "bg-orange-500/15 text-orange-600 border-orange-500/30";
    case "critical": return "bg-red-500/15 text-red-600 border-red-500/30";
    default: return "bg-zinc-500/15 text-zinc-600 border-zinc-500/30";
  }
}

export type StabilityInfo = {
  stability: Stability;
  transitions: number;
  connectedDisconnectedFlips: number;
  sampleSize: number;
  recentStates: string[];
};

export function computeConnectionStability(snaps: ConnectionSnapshot[]): StabilityInfo {
  if (!snaps || snaps.length < 3) {
    return {
      stability: "unknown",
      transitions: 0,
      connectedDisconnectedFlips: 0,
      sampleSize: snaps?.length ?? 0,
      recentStates: snaps?.slice(-5).map((s) => s.status) ?? [],
    };
  }
  const recent = snaps.slice(-10);
  let transitions = 0;
  let flips = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].status !== recent[i - 1].status) {
      transitions++;
      const a = recent[i - 1].status;
      const b = recent[i].status;
      if ((a === "connected" && b === "disconnected") || (a === "disconnected" && b === "connected")) {
        flips++;
      }
    }
  }
  let stability: Stability = "stable";
  if (transitions >= 4) stability = "critical";
  else if (flips >= 2) stability = "unstable";
  else if (transitions >= 2) stability = "warning";
  return {
    stability,
    transitions,
    connectedDisconnectedFlips: flips,
    sampleSize: recent.length,
    recentStates: recent.map((s) => s.status),
  };
}

export function recommendationForConnection(
  conn: ConnLite,
  info: StabilityInfo,
): string {
  if (info.stability === "unknown") {
    return "Dados históricos insuficientes para diagnóstico.";
  }
  if (conn.health === "critical" || conn.status === "error") {
    return "Conexão crítica. Verifique se a Evolution está respondendo e se a instância exige novo QR Code.";
  }
  if (conn.status === "disconnected" || conn.health === "offline") {
    return "Conexão offline. Verifique QR Code ou sessão da Evolution.";
  }
  if (info.stability === "critical" || info.stability === "unstable") {
    return "Conexão oscilando. Verifique instabilidade da Evolution ou rede da VPS.";
  }
  if (info.stability === "warning") {
    return "Conexão com pequenas oscilações no período recente. Acompanhar.";
  }
  if (conn.lastActivityAt) {
    const ageMs = Date.now() - new Date(conn.lastActivityAt).getTime();
    if (ageMs > 72 * 60 * 60 * 1000) {
      return "Conexão sem atividade há mais de 72h. Verifique se o número ainda está em uso.";
    }
    if (ageMs > 24 * 60 * 60 * 1000) {
      return "Conexão sem atividade recente. Verifique se o número ainda está em uso.";
    }
  }
  return "Conexão estável no período recente.";
}

export function statusLabelPt(s: string): string {
  switch ((s ?? "").toLowerCase()) {
    case "connected": return "Conectado";
    case "disconnected": return "Desconectado";
    case "connecting": return "Conectando";
    case "error": return "Erro";
    case "disabled": return "Desativado";
    case "unknown": return "Desconhecido";
    default: return s ?? "Desconhecido";
  }
}

export function formatAgo(iso: string | null | undefined): string {
  if (!iso) return "Sem registro";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "Agora mesmo";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function computeStabilityAlerts(
  conn: ConnLite,
  info: StabilityInfo,
): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];
  if (info.stability === "critical") {
    alerts.push({
      id: `conn-osc-critical-${conn.id}`,
      severity: "critical",
      title: "Conexão oscilando",
      description: `${conn.companyName} · ${conn.name}: ${info.transitions} mudanças de estado nos últimos ${info.sampleSize} snapshots.`,
      scope: `${conn.companyName} · ${conn.name}`,
      detectedAt: now(),
    });
  } else if (info.stability === "unstable" || info.stability === "warning") {
    alerts.push({
      id: `conn-osc-warning-${conn.id}`,
      severity: "warning",
      title: "Conexão com oscilação",
      description: `${conn.companyName} · ${conn.name}: ${info.transitions} mudanças nos últimos ${info.sampleSize} snapshots.`,
      scope: `${conn.companyName} · ${conn.name}`,
      detectedAt: now(),
    });
  }
  return alerts;
}

// ===== Phase 2.8: Message-flow per connection =====

export type MessageFlow = {
  inbound_24h: number;
  outbound_24h: number;
  failed_24h: number;
  pending_24h: number;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_webhook_at: string | null;
} | null;

export type FlowHealth =
  | "flowing"
  | "warning"
  | "stalled"
  | "failing"
  | "no_data";

export function flowHealthLabel(h: FlowHealth): string {
  switch (h) {
    case "flowing": return "Fluindo";
    case "warning": return "Atenção";
    case "stalled": return "Parado";
    case "failing": return "Com falhas";
    default: return "Sem dados";
  }
}

export function flowHealthClasses(h: FlowHealth): string {
  switch (h) {
    case "flowing": return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
    case "warning": return "bg-amber-500/15 text-amber-600 border-amber-500/30";
    case "stalled": return "bg-zinc-500/15 text-zinc-600 border-zinc-500/30";
    case "failing": return "bg-red-500/15 text-red-600 border-red-500/30";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

export type FlowDiagnosis = {
  health: FlowHealth;
  webhookStatus: "ok" | "stale" | "missing" | "critical" | "unknown";
  diagnosis: string;
};

export function computeFlowDiagnosis(
  conn: ConnLite,
  flow: MessageFlow,
): FlowDiagnosis {
  if (!flow) {
    return { health: "no_data", webhookStatus: "unknown", diagnosis: "Sem dados suficientes para diagnóstico." };
  }
  const connected = conn.status === "connected" || conn.health === "healthy";
  const total24 = flow.inbound_24h + flow.outbound_24h;

  // Webhook status (only meaningful when connected)
  let webhookStatus: FlowDiagnosis["webhookStatus"] = "unknown";
  if (flow.last_webhook_at) {
    const age = Date.now() - new Date(flow.last_webhook_at).getTime();
    if (age <= 30 * MIN) webhookStatus = "ok";
    else if (age <= 2 * HOUR) webhookStatus = "stale";
    else webhookStatus = "critical";
  } else if (connected && total24 > 0) {
    webhookStatus = "missing";
  }

  // Failures dominate
  if (flow.failed_24h >= 10) {
    return { health: "failing", webhookStatus, diagnosis: `Há ${flow.failed_24h} falhas de envio nas últimas 24h.` };
  }
  if (flow.failed_24h > 0) {
    return { health: "warning", webhookStatus, diagnosis: `Há ${flow.failed_24h} falha(s) de envio nas últimas 24h.` };
  }

  if (!connected) {
    return { health: "no_data", webhookStatus, diagnosis: "Conexão fora do ar. Diagnóstico de fluxo indisponível." };
  }

  if (webhookStatus === "critical") {
    return { health: "stalled", webhookStatus, diagnosis: "Conexão conectada, mas sem webhook há mais de 2h." };
  }
  if (webhookStatus === "stale") {
    return { health: "warning", webhookStatus, diagnosis: "Conexão conectada, mas sem webhook recente." };
  }
  if (total24 === 0) {
    return { health: "warning", webhookStatus, diagnosis: "Conexão conectada, sem entrada/saída de mensagens nas últimas 24h." };
  }
  return { health: "flowing", webhookStatus, diagnosis: "Fluxo normal nas últimas 24h." };
}

export function computeFlowAlerts(
  conn: ConnLite,
  flow: MessageFlow,
): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];
  if (!flow) return alerts;
  const scope = `${conn.companyName} · ${conn.name}`;
  const connected = conn.status === "connected" || conn.health === "healthy";

  // Avoid duplicating "offline" alerts for already-offline connections
  if (!connected) return alerts;

  if (flow.failed_24h >= 10) {
    alerts.push({
      id: `flow-fail-critical-${conn.id}`,
      severity: "critical",
      title: "Muitas falhas de envio",
      description: `${scope}: ${flow.failed_24h} falhas nas últimas 24h.`,
      scope,
      detectedAt: now(),
    });
  } else if (flow.failed_24h > 0) {
    alerts.push({
      id: `flow-fail-warning-${conn.id}`,
      severity: "warning",
      title: "Falhas de envio recentes",
      description: `${scope}: ${flow.failed_24h} falha(s) nas últimas 24h.`,
      scope,
      detectedAt: now(),
    });
  }

  if (flow.last_webhook_at) {
    const age = Date.now() - new Date(flow.last_webhook_at).getTime();
    if (age > 2 * HOUR) {
      alerts.push({
        id: `flow-webhook-critical-${conn.id}`,
        severity: "critical",
        title: "Webhook sem atividade há mais de 2h",
        description: `${scope}: último webhook em ${new Date(flow.last_webhook_at).toLocaleString("pt-BR")}.`,
        scope,
        detectedAt: now(),
      });
    } else if (age > 30 * MIN) {
      alerts.push({
        id: `flow-webhook-warning-${conn.id}`,
        severity: "warning",
        title: "Sem webhook recente",
        description: `${scope}: último webhook em ${new Date(flow.last_webhook_at).toLocaleString("pt-BR")}.`,
        scope,
        detectedAt: now(),
      });
    }
  }

  // Fluxo parado: conectado mas sem inbound/outbound em 24h E sem webhook nas últimas 24h
  const total24 = flow.inbound_24h + flow.outbound_24h;
  if (total24 === 0 && flow.last_webhook_at) {
    const age = Date.now() - new Date(flow.last_webhook_at).getTime();
    if (age > 24 * HOUR) {
      alerts.push({
        id: `flow-stalled-${conn.id}`,
        severity: "warning",
        title: "Fluxo parado",
        description: `${scope}: sem mensagens nas últimas 24h.`,
        scope,
        detectedAt: now(),
      });
    }
  }
  return alerts;
}
