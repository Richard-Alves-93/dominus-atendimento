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
