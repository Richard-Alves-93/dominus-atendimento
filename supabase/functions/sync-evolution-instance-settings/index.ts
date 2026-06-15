import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const EVO_URL = Deno.env.get("EVOLUTION_API_URL");
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY");
const EVO_WEBHOOK =
  Deno.env.get("EVOLUTION_WEBHOOK_URL") ??
  `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/evolution-webhook`;

// Canonical event list accepted by the current Evolution v2.x webhook enum.
// MESSAGE_STATUS / MESSAGE_UPDATE are not valid in this build; delivery/read
// receipts arrive through MESSAGES_UPDATE (and initial sends through SEND_MESSAGE).
export const WEBHOOK_EVENTS = [
  "QRCODE_UPDATED",
  "CONNECTION_UPDATE",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "MESSAGES_SET",
  "SEND_MESSAGE",
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function evoBase() {
  return EVO_URL!.replace(/\/$/, "");
}
function evoHeaders() {
  return { "Content-Type": "application/json", apikey: EVO_KEY! };
}

function webhookPayload() {
  return {
    url: EVO_WEBHOOK,
    enabled: true,
    webhook_by_events: false,
    webhookByEvents: false,
    byEvents: false,
    webhook_base64: true,
    webhookBase64: true,
    base64: true,
    events: WEBHOOK_EVENTS,
  };
}

export async function applyEvolutionSettings(instanceName: string) {
  if (!EVO_URL || !EVO_KEY) {
    throw new Error("Evolution API não configurada (EVOLUTION_API_URL / EVOLUTION_API_KEY).");
  }
  const body = webhookPayload();
  const endpoints = [`${evoBase()}/webhook/set/${instanceName}`];
  let lastErr = "";
  for (const endpoint of endpoints) {
    for (const payload of [body, { webhook: body }]) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: evoHeaders(),
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          // Best-effort: also enable delivery/read receipts when available.
          await fetch(`${evoBase()}/settings/set/${instanceName}`, {
            method: "POST",
            headers: evoHeaders(),
            body: JSON.stringify({
              reject_call: false,
              groups_ignore: false,
              always_online: false,
              read_messages: false,
              read_status: false,
              sync_full_history: false,
            }),
          }).catch(() => undefined);
          return { ok: true as const, events: WEBHOOK_EVENTS };
        }
        lastErr = `${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`;
      } catch (e) {
        lastErr = (e as Error)?.message ?? "unknown";
      }
    }
  }
  throw new Error(`Falha ao configurar webhook na Evolution: ${lastErr}`);
}

async function readEvolutionWebhook(instanceName: string) {
  if (!EVO_URL || !EVO_KEY) {
    throw new Error("Evolution API não configurada (EVOLUTION_API_URL / EVOLUTION_API_KEY).");
  }
  const endpoints = [
    `${evoBase()}/webhook/find/${instanceName}`,
    `${evoBase()}/webhook/${instanceName}`,
  ];
  for (const endpoint of endpoints) {
    const res = await fetch(endpoint, { headers: evoHeaders() }).catch(() => null);
    if (!res || !res.ok) continue;
    const data = await res.json().catch(() => ({}));
    const webhook = data?.webhook ?? data;
    return {
      enabled: webhook?.enabled ?? data?.enabled ?? null,
      url: webhook?.url ?? data?.url ?? null,
      byEvents: webhook?.byEvents ?? webhook?.webhook_by_events ?? data?.byEvents ?? null,
      base64: webhook?.base64 ?? webhook?.webhook_base64 ?? data?.base64 ?? null,
      events: webhook?.events ?? data?.events ?? [],
      rawKeys: Object.keys(data ?? {}),
    };
  }
  return null;
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

    const body = await req.json().catch(() => ({}));
    const action: "sync" | "inspect" = body?.action === "inspect" ? "inspect" : "sync";
    const channel_id: string | undefined = body?.channel_id;
    const instance_name_in: string | undefined = body?.instance_name;
    if (!channel_id && !instance_name_in) {
      return json({ error: "channel_id ou instance_name é obrigatório" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Resolve instance
    let instQuery = admin.from("whatsapp_instances").select("id, company_id, instance_name, channel_id");
    if (channel_id) instQuery = instQuery.eq("channel_id", channel_id);
    else instQuery = instQuery.eq("instance_name", instance_name_in!);
    const { data: inst, error: instErr } = await instQuery.maybeSingle();
    if (instErr || !inst) return json({ error: "Instância não encontrada" }, 404);

    // Authorize: master or admin/owner/manager of the company
    const { data: profile } = await admin
      .from("profiles")
      .select("is_master, global_role")
      .eq("id", user.id)
      .maybeSingle();
    const isMaster = profile?.is_master === true || profile?.global_role === "master";

    if (!isMaster) {
      const { data: membership } = await admin
        .from("company_users")
        .select("role")
        .eq("user_id", user.id)
        .eq("company_id", inst.company_id)
        .eq("status", "active")
        .maybeSingle();
      const role = membership?.role;
      if (!role || !["owner", "admin", "manager"].includes(role)) {
        return json({ error: "Forbidden" }, 403);
      }
    }

    try {
      if (action === "inspect") {
        const current = await readEvolutionWebhook(inst.instance_name);
        return json({ ok: true, instance_name: inst.instance_name, configured: current, expected_events: WEBHOOK_EVENTS });
      }
      await applyEvolutionSettings(inst.instance_name);
      const current = await readEvolutionWebhook(inst.instance_name);
      await admin
        .from("whatsapp_instances")
        .update({
          webhook_configured: true,
          events_configured: true,
          last_settings_sync_at: new Date().toISOString(),
          settings_sync_error: null,
        })
        .eq("id", inst.id);
      return json({ ok: true, instance_name: inst.instance_name, events: WEBHOOK_EVENTS, configured: current });
    } catch (e) {
      const msg = (e as Error).message;
      await admin
        .from("whatsapp_instances")
        .update({
          webhook_configured: false,
          events_configured: false,
          settings_sync_error: msg,
        })
        .eq("id", inst.id);
      return json({ error: msg }, 502);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
