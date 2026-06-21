import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const EVO_URL = Deno.env.get("EVOLUTION_API_URL");
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function evoBase() {
  return (EVO_URL ?? "").replace(/\/$/, "");
}

type EvoHealth = "healthy" | "warning" | "critical" | "offline" | "unknown";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: profile } = await admin
      .from("profiles")
      .select("is_master, global_role")
      .eq("id", user.id)
      .maybeSingle();
    const isMaster = profile?.is_master === true || profile?.global_role === "master";
    if (!isMaster) return json({ error: "Forbidden" }, 403);

    // Load persisted data
    const [instancesRes, channelsRes, companiesRes] = await Promise.all([
      admin
        .from("whatsapp_instances")
        .select("id, company_id, channel_id, instance_name, phone_number, status, connected_at, disconnected_at, updated_at, settings_sync_error"),
      admin
        .from("channels")
        .select("id, company_id, channel_type, channel_provider, name, status, phone_number, email_address, external_id, updated_at"),
      admin.from("companies").select("id, name"),
    ]);

    const companies = new Map<string, string>(
      (companiesRes.data ?? []).map((c: any) => [c.id, c.name])
    );

    // Call Evolution server-side
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
              it?.instance?.instanceName ??
              it?.instanceName ??
              it?.name ??
              it?.instance?.name;
            const state =
              it?.instance?.state ??
              it?.connectionStatus ??
              it?.status ??
              it?.state;
            if (name && state) evoStateByInstance.set(String(name), String(state));
          }
        } else {
          evoError = `HTTP ${res.status}`;
        }
      } catch (e) {
        evoResponseMs = Date.now() - started;
        evoError = (e as Error)?.message?.slice(0, 200) ?? "fetch_failed";
        evoOnline = false;
      }
    } else {
      evoError = "EVOLUTION_NOT_CONFIGURED";
    }

    // Build per-connection rows (WhatsApp/Evolution instances only for now)
    const connections = (instancesRes.data ?? []).map((inst: any) => {
      const liveState = inst.instance_name
        ? evoStateByInstance.get(inst.instance_name)
        : null;
      const effective = liveState ?? inst.status;
      const m = mapWaStatus(effective);
      return {
        connection_id: inst.id,
        company_id: inst.company_id,
        company_name: companies.get(inst.company_id) ?? "—",
        channel: "whatsapp",
        provider: "evolution",
        instance_name: inst.instance_name,
        identifier: inst.phone_number ?? inst.instance_name ?? "—",
        status: m.status,
        health: m.health,
        last_activity_at: inst.updated_at ?? inst.connected_at ?? null,
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

    let health: EvoHealth = "unknown";
    if (!evoOnline) health = "offline";
    else if (evoStats.error_instances > 0) health = "critical";
    else if (evoStats.disconnected_instances > 0) health = "warning";
    else health = "healthy";

    // Other channels (Meta / email) — persisted only, no live ping yet
    const otherChannels = (channelsRes.data ?? [])
      .filter((c: any) => c.channel_provider !== "evolution" && c.channel_provider !== "evogo")
      .map((c: any) => ({
        connection_id: c.id,
        company_id: c.company_id,
        company_name: companies.get(c.company_id) ?? "—",
        channel: c.channel_type,
        provider: c.channel_provider,
        instance_name: c.name,
        identifier: c.phone_number ?? c.email_address ?? c.external_id ?? "—",
        status: c.status ?? "unknown",
        health: "unknown" as Health,
        last_activity_at: c.updated_at ?? null,
        last_checked_at: new Date().toISOString(),
        error: null,
        live_checked: false,
      }));

    return json({
      checked_at: new Date().toISOString(),
      evolution: {
        online: evoOnline,
        response_time_ms: evoResponseMs,
        health,
        error: evoError,
        ...evoStats,
      },
      connections: [...connections, ...otherChannels],
      fallback: !evoOnline,
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

type Health = "healthy" | "warning" | "critical" | "offline" | "unknown";
