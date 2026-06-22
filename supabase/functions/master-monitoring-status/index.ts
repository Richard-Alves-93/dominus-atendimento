import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const EVO_URL = Deno.env.get("EVOLUTION_API_URL");
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY");
const VPS_URL = Deno.env.get("VPS_MONITORING_URL");
const VPS_SECRET = Deno.env.get("VPS_MONITORING_SECRET");
// Cron secret is fetched from Vault at request time via SECURITY DEFINER RPC.
// Env fallback (legacy) kept for compatibility but Vault is the source of truth.
const CRON_SECRET_ENV = Deno.env.get("MONITORING_CRON_SECRET");

async function getCronSecret(admin: ReturnType<typeof createClient>): Promise<string | null> {
  try {
    const { data, error } = await admin.rpc("get_monitoring_cron_secret" as any);
    if (error) throw error;
    if (typeof data === "string" && data.length > 0) return data;
  } catch (_e) {
    // do not log the secret or detailed vault errors
  }
  return CRON_SECRET_ENV ?? null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function logEvent(
  admin: ReturnType<typeof createClient>,
  args: {
    event_type: string;
    severity?: "info" | "warning" | "critical";
    source?: string;
    provider?: string | null;
    channel?: string | null;
    company_id?: string | null;
    connection_id?: string | null;
    title: string;
    description?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  try {
    await admin.rpc("monitoring_events_log" as any, {
      _event_type: args.event_type,
      _severity: args.severity ?? "info",
      _source: args.source ?? "monitoring",
      _provider: args.provider ?? null,
      _channel: args.channel ?? null,
      _company_id: args.company_id ?? null,
      _connection_id: args.connection_id ?? null,
      _title: args.title,
      _description: args.description ?? null,
      _metadata: args.metadata ?? {},
    });
  } catch (_e) {
    // never break monitoring because logging failed
  }
}


function evoBase() {
  return (EVO_URL ?? "").replace(/\/$/, "");
}

type Health = "healthy" | "warning" | "critical" | "offline" | "unknown";

function mapWaStatus(s: string | null | undefined) {
  switch ((s ?? "").toLowerCase()) {
    case "connected":
    case "open":
      return { status: "connected", health: "healthy" as const };
    case "pending":
    case "connecting":
    case "qr":
      return { status: "connecting", health: "warning" as const };
    case "disconnected":
    case "close":
      return { status: "disconnected", health: "offline" as const };
    case "error":
      return { status: "error", health: "critical" as const };
    default:
      return { status: "unknown", health: "unknown" as const };
  }
}

async function collectEvolutionHealth(admin: ReturnType<typeof createClient>) {
  const [instancesRes, channelsRes, companiesRes] = await Promise.all([
    admin
      .from("whatsapp_instances")
      .select("id, company_id, channel_id, instance_name, phone_number, status, connected_at, disconnected_at, updated_at, settings_sync_error, last_webhook_at"),
    admin
      .from("channels")
      .select("id, company_id, channel_type, channel_provider, name, status, phone_number, email_address, external_id, updated_at"),
    admin.from("companies").select("id, name"),
  ]);


  const companies = new Map<string, string>(
    (companiesRes.data ?? []).map((c: any) => [c.id, c.name])
  );

  let evoOnline = false;
  let evoResponseMs: number | null = null;
  let evoError: string | null = null;
  const evoStateByInstance = new Map<string, string>();

  if (EVO_URL && EVO_KEY) {
    const started = Date.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(`${evoBase()}/instance/fetchInstances`, {
        headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      evoResponseMs = Date.now() - started;
      if (res.ok) {
        evoOnline = true;
        const data = await res.json().catch(() => []);
        const arr = Array.isArray(data) ? data : [data];
        for (const it of arr) {
          const name =
            it?.instance?.instanceName ?? it?.instanceName ?? it?.name ?? it?.instance?.name;
          const state =
            it?.instance?.state ?? it?.connectionStatus ?? it?.status ?? it?.state;
          if (name && state) evoStateByInstance.set(String(name), String(state));
        }
      } else {
        evoError = `HTTP ${res.status}`;
      }
    } catch (e) {
      evoResponseMs = evoResponseMs ?? Date.now() - started;
      evoError = (e as Error)?.message?.slice(0, 200) ?? "fetch_failed";
      evoOnline = false;
    }
  } else {
    evoError = "EVOLUTION_NOT_CONFIGURED";
  }

  const connections = (instancesRes.data ?? []).map((inst: any) => {
    const liveState = inst.instance_name ? evoStateByInstance.get(inst.instance_name) : null;
    const effective = liveState ?? inst.status;
    const m = mapWaStatus(effective);
    return {
      connection_id: inst.id,
      channel_id: inst.channel_id ?? null,
      company_id: inst.company_id,
      company_name: companies.get(inst.company_id) ?? "—",
      channel: "whatsapp",
      provider: "evolution",
      instance_name: inst.instance_name,
      identifier: inst.phone_number ?? inst.instance_name ?? "—",
      status: m.status,
      health: m.health,
      last_activity_at: inst.updated_at ?? inst.connected_at ?? null,
      last_webhook_at: inst.last_webhook_at ?? null,
      last_checked_at: new Date().toISOString(),
      error: inst.settings_sync_error ?? null,
      live_checked: liveState !== null && liveState !== undefined,
    };
  });


  const evoStats = {
    total_instances: connections.length,
    connected_instances: connections.filter((c) => c.status === "connected").length,
    disconnected_instances: connections.filter((c) => c.status === "disconnected").length,
    error_instances: connections.filter((c) => c.status === "error").length,
  };

  let health: Health = "unknown";
  if (!evoOnline) health = "offline";
  else if (evoStats.error_instances > 0) health = "critical";
  else if (evoStats.disconnected_instances > 0) health = "warning";
  else health = "healthy";

  const otherChannels = (channelsRes.data ?? [])
    .filter((c: any) => c.channel_provider !== "evolution" && c.channel_provider !== "evogo")
    .map((c: any) => ({
      connection_id: c.id,
      channel_id: c.id,
      company_id: c.company_id,
      company_name: companies.get(c.company_id) ?? "—",
      channel: c.channel_type,
      provider: c.channel_provider,
      instance_name: c.name,
      identifier: c.phone_number ?? c.email_address ?? c.external_id ?? "—",
      status: c.status ?? "unknown",
      health: "unknown" as Health,
      last_activity_at: c.updated_at ?? null,
      last_webhook_at: null,
      last_checked_at: new Date().toISOString(),
      error: null,
      live_checked: false,
    }));

  return { evoOnline, evoResponseMs, evoError, evoStats, health, connections, otherChannels };
}

type FlowRow = {
  inbound_24h: number;
  outbound_24h: number;
  failed_24h: number;
  pending_24h: number;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
};

async function collectMessageFlow(
  admin: ReturnType<typeof createClient>,
): Promise<Map<string, FlowRow>> {
  const map = new Map<string, FlowRow>();
  try {
    const { data, error } = await admin.rpc("master_message_flow_24h" as any);
    if (error) throw error;
    for (const r of (data as any[]) ?? []) {
      if (!r?.channel_id) continue;
      map.set(String(r.channel_id), {
        inbound_24h: Number(r.inbound_24h ?? 0),
        outbound_24h: Number(r.outbound_24h ?? 0),
        failed_24h: Number(r.failed_24h ?? 0),
        pending_24h: Number(r.pending_24h ?? 0),
        last_inbound_at: r.last_inbound_at ?? null,
        last_outbound_at: r.last_outbound_at ?? null,
      });
    }
  } catch (e) {
    console.error("[collectMessageFlow] failed", (e as Error)?.message);
  }
  return map;
}

function attachFlow<T extends { channel_id?: string | null }>(
  rows: T[],
  flow: Map<string, FlowRow>,
): (T & { flow: FlowRow | null })[] {
  return rows.map((r) => ({
    ...r,
    flow: r.channel_id ? flow.get(String(r.channel_id)) ?? null : null,
  }));
}


async function saveEvolutionSnapshot(
  admin: ReturnType<typeof createClient>,
  data: Awaited<ReturnType<typeof collectEvolutionHealth>>,
  source: string,
) {
  const { data: snap, error } = await admin
    .from("evolution_health_snapshots")
    .insert({
      api_online: data.evoOnline,
      health: data.health,
      response_time_ms: data.evoResponseMs,
      total_instances: data.evoStats.total_instances,
      connected_instances: data.evoStats.connected_instances,
      disconnected_instances: data.evoStats.disconnected_instances,
      error_instances: data.evoStats.error_instances,
      source,
      metadata: { error: data.evoError },
    })
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return snap?.id ?? null;
}

async function cleanupOldSnapshots(admin: ReturnType<typeof createClient>) {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await admin.from("evolution_health_snapshots").delete().lt("created_at", cutoff);
  } catch (e) {
    console.error("[cleanupOldSnapshots] failed", (e as Error)?.message);
  }
}

type VpsHealth = {
  configured: boolean;
  ok: boolean;
  checked_at: string;
  response_time_ms: number | null;
  status: string;
  health: "healthy" | "warning" | "critical" | "offline" | "unknown" | "not_configured";
  cpu_percent: number | null;
  memory_percent: number | null;
  disk_percent: number | null;
  load_average: number | null;
  uptime_seconds: number | null;
  hostname: string | null;
  error: string | null;
};

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function vpsHealthFrom(cpu: number | null, mem: number | null, disk: number | null, ok: boolean): VpsHealth["health"] {
  if (!ok) return "offline";
  const crit =
    (cpu != null && cpu >= 95) ||
    (mem != null && mem >= 95) ||
    (disk != null && disk >= 90);
  if (crit) return "critical";
  const warn =
    (cpu != null && cpu >= 85) ||
    (mem != null && mem >= 85) ||
    (disk != null && disk >= 80);
  if (warn) return "warning";
  return "healthy";
}

async function collectVpsHealth(): Promise<VpsHealth> {
  const now = new Date().toISOString();
  if (!VPS_URL || !VPS_SECRET) {
    return {
      configured: false,
      ok: false,
      checked_at: now,
      response_time_ms: null,
      status: "not_configured",
      health: "not_configured",
      cpu_percent: null,
      memory_percent: null,
      disk_percent: null,
      load_average: null,
      uptime_seconds: null,
      hostname: null,
      error: null,
    };
  }
  const started = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(VPS_URL, {
      headers: { "x-monitoring-secret": VPS_SECRET, "Content-Type": "application/json" },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const rtt = Date.now() - started;
    if (!res.ok) {
      return {
        configured: true,
        ok: false,
        checked_at: now,
        response_time_ms: rtt,
        status: "error",
        health: "offline",
        cpu_percent: null,
        memory_percent: null,
        disk_percent: null,
        load_average: null,
        uptime_seconds: null,
        hostname: null,
        error: `HTTP ${res.status}`,
      };
    }
    const body = await res.json().catch(() => ({} as any));
    const cpu = num(body?.cpu_percent ?? body?.cpu);
    const mem = num(body?.memory_percent ?? body?.memory);
    const disk = num(body?.disk_percent ?? body?.disk);
    const load = num(body?.load_average ?? body?.load);
    const up = num(body?.uptime_seconds ?? body?.uptime);
    const ok = body?.ok !== false;
    return {
      configured: true,
      ok,
      checked_at: typeof body?.checked_at === "string" ? body.checked_at : now,
      response_time_ms: rtt,
      status: ok ? "online" : "offline",
      health: vpsHealthFrom(cpu, mem, disk, ok),
      cpu_percent: cpu,
      memory_percent: mem,
      disk_percent: disk,
      load_average: load,
      uptime_seconds: up != null ? Math.trunc(up) : null,
      hostname: typeof body?.hostname === "string" ? body.hostname.slice(0, 80) : null,
      error: null,
    };
  } catch (e) {
    return {
      configured: true,
      ok: false,
      checked_at: now,
      response_time_ms: Date.now() - started,
      status: "error",
      health: "offline",
      cpu_percent: null,
      memory_percent: null,
      disk_percent: null,
      load_average: null,
      uptime_seconds: null,
      hostname: null,
      error: (e as Error)?.message?.slice(0, 120) ?? "fetch_failed",
    };
  }
}

async function saveVpsSnapshot(admin: ReturnType<typeof createClient>, v: VpsHealth, source: string) {
  if (!v.configured) return null;
  const { data, error } = await admin
    .from("infrastructure_health_snapshots")
    .insert({
      source,
      status: v.status,
      health: v.health,
      cpu_percent: v.cpu_percent,
      memory_percent: v.memory_percent,
      disk_percent: v.disk_percent,
      load_average: v.load_average,
      uptime_seconds: v.uptime_seconds,
      response_time_ms: v.response_time_ms,
      metadata: { hostname: v.hostname, error: v.error },
    })
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function cleanupOldInfraSnapshots(admin: ReturnType<typeof createClient>) {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await admin.from("infrastructure_health_snapshots").delete().lt("created_at", cutoff);
  } catch (e) {
    console.error("[cleanupOldInfraSnapshots] failed", (e as Error)?.message);
  }
}

async function saveConnectionSnapshots(
  admin: ReturnType<typeof createClient>,
  data: Awaited<ReturnType<typeof collectEvolutionHealth>>,
  source: string,
) {
  const all = [...data.connections, ...data.otherChannels];
  if (all.length === 0) return 0;
  const rows = all.map((c) => ({
    company_id: c.company_id ?? null,
    connection_id: c.connection_id ?? null,
    channel: c.channel,
    provider: c.provider,
    instance_name: c.instance_name ?? null,
    identifier: c.identifier ?? null,
    status: c.status ?? "unknown",
    health: c.health ?? "unknown",
    last_activity_at: c.last_activity_at ?? null,
    last_error_at: c.error ? new Date().toISOString() : null,
    error_count: c.error ? 1 : 0,
    reconnect_count: 0,
    source,
    metadata: {
      live_checked: (c as any).live_checked === true,
      error: c.error ? String(c.error).slice(0, 200) : null,
    },
  }));
  const { error } = await admin.from("connection_health_snapshots").insert(rows);
  if (error) throw error;
  return rows.length;
}

async function cleanupOldConnectionSnapshots(admin: ReturnType<typeof createClient>) {
  try {
    await admin.rpc("connection_health_cleanup" as any);
  } catch (e) {
    console.error("[cleanupOldConnectionSnapshots] failed", (e as Error)?.message);
  }
}

async function saveFlowSnapshots(
  admin: ReturnType<typeof createClient>,
  data: Awaited<ReturnType<typeof collectEvolutionHealth>>,
  flow: Map<string, FlowRow>,
  source: string,
) {
  const all = [...data.connections, ...data.otherChannels];
  if (all.length === 0) return 0;
  const rows = all.map((c) => {
    const f = c.channel_id ? flow.get(String(c.channel_id)) : null;
    return {
      company_id: c.company_id ?? null,
      connection_id: c.connection_id ?? null,
      channel_id: c.channel_id ?? null,
      channel: c.channel,
      provider: c.provider,
      instance_name: c.instance_name ?? null,
      identifier: c.identifier ?? null,
      inbound_count_24h: f?.inbound_24h ?? 0,
      outbound_count_24h: f?.outbound_24h ?? 0,
      failed_count_24h: f?.failed_24h ?? 0,
      pending_count_24h: f?.pending_24h ?? 0,
      last_inbound_at: f?.last_inbound_at ?? null,
      last_outbound_at: f?.last_outbound_at ?? null,
      last_webhook_at: (c as any).last_webhook_at ?? null,
      health: c.health ?? "unknown",
      source,
    };
  });
  const { error } = await admin.from("connection_message_flow_snapshots").insert(rows);
  if (error) throw error;
  return rows.length;
}

async function cleanupOldFlowSnapshots(admin: ReturnType<typeof createClient>) {
  try {
    await admin.rpc("connection_message_flow_cleanup" as any);
  } catch (e) {
    console.error("[cleanupOldFlowSnapshots] failed", (e as Error)?.message);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // ---------- CRON MODE ----------
    const cronHeader = req.headers.get("x-cron-secret");
    if (cronHeader) {
      const expected = await getCronSecret(admin);
      if (!expected || cronHeader !== expected) {
        await logEvent(admin, {
          event_type: "cron.unauthorized",
          severity: "warning",
          source: "cron",
          title: "Tentativa de cron sem secret válido",
          description: "Requisição rejeitada (401).",
        });
        return json({ error: "Unauthorized" }, 401);
      }
      // Prevent overlapping cron executions using a Postgres advisory lock.
      let gotLock = false;
      try {
        const { data: lockData } = await admin.rpc("try_monitoring_cron_lock" as any);
        gotLock = lockData === true;
      } catch {
        gotLock = true; // fail-open: if RPC unavailable, proceed
      }
      if (!gotLock) {
        return json({
          mode: "cron",
          skipped: true,
          reason: "already_running",
          checked_at: new Date().toISOString(),
        });
      }
      try {
        const data = await collectEvolutionHealth(admin);
        const vps = await collectVpsHealth();
        const flow = await collectMessageFlow(admin);

        // Log cron run
        await logEvent(admin, {
          event_type: "cron.run",
          severity: "info",
          source: "cron",
          title: "Cron de monitoramento executado",
          description: `Evolution: ${data.evoOnline ? "online" : "offline"} · VPS: ${vps.configured ? vps.status : "não configurada"}`,
        });

        // Evolution offline
        if (!data.evoOnline) {
          await logEvent(admin, {
            event_type: "evolution.offline",
            severity: "critical",
            source: "evolution",
            provider: "evolution",
            title: "Evolution API offline",
            description: data.evoError ? `Erro: ${data.evoError}` : "API não respondeu na coleta.",
          });
        }
        // VPS offline / erro
        if (vps.configured && !vps.ok) {
          await logEvent(admin, {
            event_type: "vps.offline",
            severity: "critical",
            source: "vps",
            title: "VPS de monitoramento offline",
            description: vps.error ? `Erro: ${vps.error}` : "VPS não respondeu na coleta.",
          });
        }

        let snapshotId: string | null = null;
        let snapshotError: string | null = null;
        try {
          snapshotId = await saveEvolutionSnapshot(admin, data, "cron");
        } catch (e) {
          snapshotError = (e as Error)?.message?.slice(0, 200) ?? "snapshot_failed";
          await logEvent(admin, {
            event_type: "snapshot.failed",
            severity: "critical",
            source: "evolution",
            title: "Falha ao salvar snapshot Evolution",
            description: snapshotError,
          });
        }
        let vpsSnapshotId: string | null = null;
        try {
          if (vps.configured) vpsSnapshotId = await saveVpsSnapshot(admin, vps, "cron");
        } catch (e) {
          await logEvent(admin, {
            event_type: "snapshot.failed",
            severity: "critical",
            source: "vps",
            title: "Falha ao salvar snapshot VPS",
            description: (e as Error)?.message?.slice(0, 200) ?? null,
          });
        }
        let connSnapshotsCount = 0;
        try {
          connSnapshotsCount = await saveConnectionSnapshots(admin, data, "cron");
        } catch (e) {
          console.error("[saveConnectionSnapshots cron] failed", (e as Error)?.message);
          await logEvent(admin, {
            event_type: "snapshot.failed",
            severity: "warning",
            source: "connection",
            title: "Falha ao salvar snapshots de conexões",
            description: (e as Error)?.message?.slice(0, 200) ?? null,
          });
        }
        let flowSnapshotsCount = 0;
        try {
          flowSnapshotsCount = await saveFlowSnapshots(admin, data, flow, "cron");
        } catch (e) {
          console.error("[saveFlowSnapshots cron] failed", (e as Error)?.message);
          await logEvent(admin, {
            event_type: "snapshot.failed",
            severity: "warning",
            source: "flow",
            title: "Falha ao salvar snapshots de fluxo",
            description: (e as Error)?.message?.slice(0, 200) ?? null,
          });
        }

        // Conexões críticas detectadas
        for (const c of data.connections) {
          if (c.health === "critical" || c.status === "error") {
            await logEvent(admin, {
              event_type: "connection.critical",
              severity: "critical",
              source: "connection",
              provider: c.provider,
              channel: c.channel,
              company_id: c.company_id ?? null,
              connection_id: c.connection_id ?? null,
              title: `Conexão crítica: ${c.instance_name ?? c.identifier ?? c.connection_id}`,
              description: c.error ? String(c.error).slice(0, 200) : `Status ${c.status}`,
            });
          }
        }

        await cleanupOldSnapshots(admin);
        await cleanupOldInfraSnapshots(admin);
        await cleanupOldConnectionSnapshots(admin);
        await cleanupOldFlowSnapshots(admin);
        try { await admin.rpc("monitoring_events_cleanup" as any); } catch { /* ignore */ }

        return json({
          mode: "cron",
          checked_at: new Date().toISOString(),
          evolution: {
            online: data.evoOnline,
            response_time_ms: data.evoResponseMs,
            health: data.health,
            ...data.evoStats,
          },
          infrastructure: vps,
          snapshot_saved: snapshotId !== null,
          snapshot_id: snapshotId,
          snapshot_error: snapshotError,
          infra_snapshot_saved: vpsSnapshotId !== null,
        });
      } finally {
        try { await admin.rpc("release_monitoring_cron_lock" as any); } catch { /* ignore */ }
      }
    }



    // ---------- MASTER MODE (JWT) ----------
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    let saveSnapshot = false;
    let snapshotSource = "manual";
    if (req.method === "POST") {
      try {
        const body = await req.json().catch(() => ({}));
        saveSnapshot = body?.save_snapshot === true;
        if (typeof body?.source === "string") snapshotSource = body.source.slice(0, 50);
      } catch { /* ignore */ }
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { data: profile } = await admin
      .from("profiles")
      .select("is_master, global_role")
      .eq("id", user.id)
      .maybeSingle();
    const isMaster = profile?.is_master === true || profile?.global_role === "master";
    if (!isMaster) return json({ error: "Forbidden" }, 403);

    const data = await collectEvolutionHealth(admin);
    const vps = await collectVpsHealth();
    const flow = await collectMessageFlow(admin);

    let snapshotSaved = false;
    let snapshotId: string | null = null;
    let snapshotError: string | null = null;
    if (saveSnapshot) {
      try {
        snapshotId = await saveEvolutionSnapshot(admin, data, snapshotSource);
        snapshotSaved = snapshotId !== null;
      } catch (e) {
        snapshotError = (e as Error)?.message?.slice(0, 200) ?? "snapshot_failed";
      }
      try {
        if (vps.configured) await saveVpsSnapshot(admin, vps, snapshotSource);
      } catch (_e) { /* ignore */ }
      try {
        await saveConnectionSnapshots(admin, data, snapshotSource);
      } catch (e) {
        console.error("[saveConnectionSnapshots manual] failed", (e as Error)?.message);
      }
      try {
        await saveFlowSnapshots(admin, data, flow, snapshotSource);
      } catch (e) {
        console.error("[saveFlowSnapshots manual] failed", (e as Error)?.message);
      }
    }

    return json({
      checked_at: new Date().toISOString(),
      evolution: {
        online: data.evoOnline,
        response_time_ms: data.evoResponseMs,
        health: data.health,
        error: data.evoError,
        ...data.evoStats,
      },
      infrastructure: vps,
      connections: attachFlow([...data.connections, ...data.otherChannels], flow),
      fallback: !data.evoOnline,
      snapshot_saved: snapshotSaved,
      snapshot_id: snapshotId,
      snapshot_error: snapshotError,
    });
  } catch (e) {
    console.error("[master-monitoring-status] error", e);
    return json(
      {
        error: "SERVICE_FAILED",
        message: (e as Error)?.message?.slice(0, 200),
        fallback: true,
        checked_at: new Date().toISOString(),
        evolution: {
          online: false,
          response_time_ms: null,
          health: "unknown",
          total_instances: 0,
          connected_instances: 0,
          disconnected_instances: 0,
          error_instances: 0,
        },
        connections: [],
      },
      200,
    );
  }
});
