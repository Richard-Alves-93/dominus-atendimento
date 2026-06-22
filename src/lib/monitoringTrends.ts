// Fase 2.10 — Alertas por tendência
// Fase 2.11 — Exportação CSV de histórico
// Helpers puros, sem acesso a secrets nem payloads brutos.

import type { OperationalAlert, VpsLive } from "./monitoringAlerts";

const now = () => new Date().toISOString();

// ===== Trend helpers =====

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function consecutiveRising(vals: (number | null | undefined)[], minRise = 3): boolean {
  const clean = vals.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (clean.length < minRise + 1) return false;
  const tail = clean.slice(-(minRise + 1));
  for (let i = 1; i < tail.length; i++) {
    if (!(tail[i] > tail[i - 1])) return false;
  }
  return true;
}

export type EvoTrendSnap = {
  created_at: string;
  response_time_ms: number | null;
};

export function computeEvolutionLatencyTrend(
  history: EvoTrendSnap[],
): OperationalAlert | null {
  const samples = history
    .map((s) => s.response_time_ms)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (samples.length < 10) return null;
  const last5 = samples.slice(-5);
  const prev5 = samples.slice(-10, -5);
  const a = avg(prev5);
  const b = avg(last5);
  if (a <= 0) return null;
  const ratio = b / a;
  if (ratio >= 1.7) {
    return {
      id: "trend-evo-latency-critical",
      severity: "critical",
      title: "Latência da Evolution subindo rapidamente",
      description: `Média recente ${Math.round(b)} ms vs ${Math.round(a)} ms anteriores (+${Math.round((ratio - 1) * 100)}%).`,
      scope: "Evolution · Tendência",
      detectedAt: now(),
    };
  }
  if (ratio >= 1.3) {
    return {
      id: "trend-evo-latency-warning",
      severity: "warning",
      title: "Latência da Evolution em tendência de alta",
      description: `Média recente ${Math.round(b)} ms vs ${Math.round(a)} ms anteriores (+${Math.round((ratio - 1) * 100)}%).`,
      scope: "Evolution · Tendência",
      detectedAt: now(),
    };
  }
  return null;
}

export type VpsTrendSnap = {
  created_at: string;
  cpu_percent: number | null;
  memory_percent: number | null;
  disk_percent: number | null;
};

export function computeVpsTrendAlerts(
  history: VpsTrendSnap[],
  current: VpsLive,
): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];
  if (!history || history.length < 4) return alerts;
  if (!current || !current.configured) return alerts;

  const push = (id: string, sev: "warning" | "critical", title: string, description: string) =>
    alerts.push({ id, severity: sev, title, description, scope: "Infraestrutura · Tendência", detectedAt: now() });

  const cpu = history.map((s) => s.cpu_percent);
  const mem = history.map((s) => s.memory_percent);
  const disk = history.map((s) => s.disk_percent);

  if (consecutiveRising(cpu)) {
    const cur = current.cpu_percent ?? null;
    if (cur != null && cur >= 85) {
      push("trend-vps-cpu-critical", "critical", "CPU em crescimento e acima do limite", `Uso de CPU subindo continuamente e em ${cur.toFixed(0)}%.`);
    } else {
      push("trend-vps-cpu-warning", "warning", "Uso de CPU em crescimento", "CPU subindo em snapshots consecutivos.");
    }
  }
  if (consecutiveRising(mem)) {
    const cur = current.memory_percent ?? null;
    if (cur != null && cur >= 85) {
      push("trend-vps-mem-critical", "critical", "Memória em crescimento e acima do limite", `Uso de memória subindo continuamente e em ${cur.toFixed(0)}%.`);
    } else {
      push("trend-vps-mem-warning", "warning", "Uso de memória em crescimento", "Memória subindo em snapshots consecutivos.");
    }
  }
  if (consecutiveRising(disk)) {
    const cur = current.disk_percent ?? null;
    if (cur != null && cur >= 80) {
      push("trend-vps-disk-critical", "critical", "Disco em crescimento e acima do limite", `Uso de disco subindo continuamente e em ${cur.toFixed(0)}%.`);
    } else {
      push("trend-vps-disk-warning", "warning", "Disco da VPS em crescimento", "Disco subindo em snapshots consecutivos.");
    }
  }
  return alerts;
}

export type FlowTrendSnap = {
  created_at: string;
  connection_id: string | null;
  failed_count_24h: number | null;
  pending_count_24h: number | null;
};

export function computeFlowTrendAlerts(
  snaps: FlowTrendSnap[],
  connInfo: Map<string, { id: string; companyName: string; name: string; offline: boolean }>,
): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];
  if (!snaps?.length) return alerts;
  // group by connection_id
  const byConn = new Map<string, FlowTrendSnap[]>();
  for (const s of snaps) {
    const k = s.connection_id ?? "";
    if (!k) continue;
    const arr = byConn.get(k) ?? [];
    arr.push(s);
    byConn.set(k, arr);
  }
  for (const [connId, arr] of byConn) {
    arr.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const info = connInfo.get(connId);
    if (!info) continue;
    if (info.offline) continue; // evitar duplicar alertas para conexões já offline
    const scope = `${info.companyName} · ${info.name}`;

    const fails = arr.map((s) => s.failed_count_24h ?? 0);
    const pends = arr.map((s) => s.pending_count_24h ?? 0);

    // Falhas crescentes
    if (consecutiveRising(fails)) {
      const last = fails[fails.length - 1] ?? 0;
      if (last >= 10) {
        alerts.push({
          id: `trend-flow-fail-critical-${connId}`,
          severity: "critical",
          title: "Falhas de envio aumentando",
          description: `${scope}: falhas crescendo em snapshots recentes (${last} nas últimas 24h).`,
          scope: `${scope} · Tendência`,
          detectedAt: now(),
        });
      } else {
        alerts.push({
          id: `trend-flow-fail-warning-${connId}`,
          severity: "warning",
          title: "Falhas de envio aumentando",
          description: `${scope}: falhas em crescimento nos snapshots recentes.`,
          scope: `${scope} · Tendência`,
          detectedAt: now(),
        });
      }
    }

    // Pendentes persistentes
    const recent = pends.slice(-5);
    if (recent.length >= 3 && recent.every((v) => v > 0)) {
      const last = recent[recent.length - 1];
      const persistent = recent.length >= 5 && last > 0;
      if (persistent && last >= 10) {
        alerts.push({
          id: `trend-flow-pending-critical-${connId}`,
          severity: "critical",
          title: "Mensagens pendentes persistentes",
          description: `${scope}: pendentes não zeraram nos últimos snapshots (${last}).`,
          scope: `${scope} · Tendência`,
          detectedAt: now(),
        });
      } else {
        alerts.push({
          id: `trend-flow-pending-warning-${connId}`,
          severity: "warning",
          title: "Mensagens pendentes persistentes",
          description: `${scope}: pendentes acima de zero em vários snapshots.`,
          scope: `${scope} · Tendência`,
          detectedAt: now(),
        });
      }
    }
  }
  return alerts;
}

// ===== CSV export helpers =====

function csvEscape(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  let s = typeof v === "string" ? v : String(v);
  if (/[",\n;\r]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowsToCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: (keyof T & string)[],
): string {
  const header = columns.join(",");
  const body = rows
    .map((r) => columns.map((c) => csvEscape(r[c])).join(","))
    .join("\n");
  return body ? `${header}\n${body}\n` : `${header}\n`;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ExportPeriod = "1h" | "6h" | "24h";

export function exportPeriodHours(p: ExportPeriod): number {
  return p === "1h" ? 1 : p === "6h" ? 6 : 24;
}

export const EXPORT_MAX_ROWS = 5000;
