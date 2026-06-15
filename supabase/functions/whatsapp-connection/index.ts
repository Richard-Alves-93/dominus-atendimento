import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface Body {
  action: "create_or_connect" | "status" | "disconnect";
  company_id: string;
  channel_id?: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const EVO_URL = Deno.env.get("EVOLUTION_API_URL");
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY");
const EVO_WEBHOOK = Deno.env.get("EVOLUTION_WEBHOOK_URL");
const EVO_ENABLED = Boolean(EVO_URL && EVO_KEY);

const WEBHOOK_EVENTS = [
  "QRCODE_UPDATED",
  "CONNECTION_UPDATE",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "MESSAGES_SET",
  "MESSAGE_STATUS",
  "SEND_MESSAGE",
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function instanceNameFor(companyId: string) {
  return `dominus_${companyId.replace(/-/g, "").slice(0, 8)}`;
}

function evoBase() {
  return EVO_URL!.replace(/\/$/, "");
}

function evoHeaders() {
  return {
    "Content-Type": "application/json",
    apikey: EVO_KEY!,
  };
}

function evoWebhookConfig() {
  return {
    url: EVO_WEBHOOK,
    enabled: true,
    webhook_by_events: false,
    byEvents: false,
    webhook_base64: true,
    base64: true,
    events: WEBHOOK_EVENTS,
  };
}

function mapState(state?: string): "connected" | "pending" | "disconnected" {
  if (state === "open") return "connected";
  if (state === "connecting") return "pending";
  return "disconnected";
}

function ensureDataUrl(qr?: string | null): string | null {
  if (!qr) return null;
  if (qr.startsWith("data:")) return qr;
  return `data:image/png;base64,${qr}`;
}

async function evoFetchInstance(instanceName: string) {
  const res = await fetch(`${evoBase()}/instance/fetchInstances?instanceName=${instanceName}`, {
    headers: evoHeaders(),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const arr = Array.isArray(data) ? data : [data];
  return arr[0] ?? null;
}

async function evoSyncWebhook(instanceName: string) {
  if (!EVO_WEBHOOK) return;
  const body = evoWebhookConfig();
  const endpoints = [`${evoBase()}/webhook/set/${instanceName}`, `${evoBase()}/webhook/${instanceName}`];
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: evoHeaders(),
        body: JSON.stringify(body),
      });
      if (res.ok) {
        console.log("[WA_CONN] webhook_sync_ok", { instanceName, events: WEBHOOK_EVENTS });
        return;
      }
      const text = await res.text().catch(() => "");
      console.warn("[WA_CONN] webhook_sync_failed", { instanceName, status: res.status, endpoint: endpoint.replace(evoBase(), ""), body: text.slice(0, 160) });
    } catch (e) {
      console.warn("[WA_CONN] webhook_sync_exception", { instanceName, message: (e as Error)?.message });
    }
  }
}

async function evoCreateInstance(instanceName: string) {
  const body: Record<string, unknown> = {
    instanceName,
    qrcode: true,
    integration: "WHATSAPP-BAILEYS",
  };
  if (EVO_WEBHOOK) {
    body.webhook = evoWebhookConfig();
  }
  const res = await fetch(`${evoBase()}/instance/create`, {
    method: "POST",
    headers: evoHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // If already exists, fall back to connect
    if (res.status === 403 || res.status === 409 || String(data?.response?.message ?? "").includes("already")) {
      return await evoConnect(instanceName);
    }
    throw new Error(`Evolution create failed: ${res.status} ${JSON.stringify(data)}`);
  }
  const qr = data?.qrcode?.base64 ?? data?.qrcode?.code ?? null;
  return { qr_code: ensureDataUrl(qr), status: "pending" as const };
}

async function evoConnect(instanceName: string) {
  const res = await fetch(`${evoBase()}/instance/connect/${instanceName}`, {
    headers: evoHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Evolution connect failed: ${res.status} ${JSON.stringify(data)}`);
  const qr = data?.base64 ?? data?.qrcode?.base64 ?? data?.code ?? null;
  return { qr_code: ensureDataUrl(qr), status: "pending" as const };
}

async function evoConnectionState(instanceName: string) {
  const res = await fetch(`${evoBase()}/instance/connectionState/${instanceName}`, {
    headers: evoHeaders(),
  });
  if (!res.ok) return { state: "close" };
  const data = await res.json().catch(() => ({}));
  return { state: data?.instance?.state ?? data?.state ?? "close" };
}

async function evoLogout(instanceName: string) {
  await fetch(`${evoBase()}/instance/logout/${instanceName}`, {
    method: "DELETE",
    headers: evoHeaders(),
  }).catch(() => undefined);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json()) as Body;
    if (!body?.company_id) return json({ error: "company_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: profile } = await admin
      .from("profiles")
      .select("is_master, global_role")
      .eq("id", user.id)
      .maybeSingle();
    const isMaster = profile?.is_master === true || profile?.global_role === "master";

    if (!isMaster) {
      const { data: membership } = await admin
        .from("company_users")
        .select("id")
        .eq("user_id", user.id)
        .eq("company_id", body.company_id)
        .eq("status", "active")
        .maybeSingle();
      if (!membership) return json({ error: "Forbidden" }, 403);
    }

    let channel;
    if (body.channel_id) {
      const { data } = await admin.from("channels").select("*").eq("id", body.channel_id).maybeSingle();
      channel = data;
    } else {
      const { data } = await admin
        .from("channels")
        .select("*")
        .eq("company_id", body.company_id)
        .eq("channel_type", "whatsapp")
        .maybeSingle();
      channel = data;
    }

    const instance_name = instanceNameFor(body.company_id);

    if (body.action === "create_or_connect") {
      if (!EVO_ENABLED) {
        return json({ error: "Evolution API não configurada. Defina EVOLUTION_API_URL e EVOLUTION_API_KEY." }, 500);
      }

      if (!channel) {
        const { data: created, error } = await admin
          .from("channels")
          .insert({
            company_id: body.company_id,
            channel_type: "whatsapp",
            channel_provider: "evolution",
            name: "WhatsApp",
            status: "pending",
          })
          .select()
          .single();
        if (error) return json({ error: error.message }, 500);
        channel = created;
      } else {
        await admin.from("channels").update({ status: "pending" }).eq("id", channel.id);
      }

      // Try connect first (works if instance already exists); otherwise create.
      let evo: { qr_code: string | null; status: "pending" };
      const existing = await evoFetchInstance(instance_name);
      if (existing) {
        evo = await evoConnect(instance_name);
      } else {
        evo = await evoCreateInstance(instance_name);
      }

      await evoSyncWebhook(instance_name);

      const { data: existingInst } = await admin
        .from("whatsapp_instances")
        .select("id")
        .eq("channel_id", channel.id)
        .maybeSingle();

      if (existingInst) {
        await admin
          .from("whatsapp_instances")
          .update({ status: "pending", qr_code: evo.qr_code, instance_name })
          .eq("id", existingInst.id);
      } else {
        await admin.from("whatsapp_instances").insert({
          company_id: body.company_id,
          channel_id: channel.id,
          instance_name,
          status: "pending",
          qr_code: evo.qr_code,
        });
      }

      return json({
        status: "pending",
        qr_code: evo.qr_code,
        instance_name,
        channel_id: channel.id,
      });
    }

    if (body.action === "status") {
      if (!channel) return json({ status: "disconnected" });

      const { data: inst } = await admin
        .from("whatsapp_instances")
        .select("status, qr_code, instance_name, phone_number")
        .eq("channel_id", channel.id)
        .maybeSingle();

      let status = inst?.status ?? channel.status ?? "disconnected";
      let qr_code = inst?.qr_code ?? null;

      if (EVO_ENABLED && inst?.instance_name) {
        try {
          await evoSyncWebhook(inst.instance_name);
          const { state } = await evoConnectionState(inst.instance_name);
          const mapped = mapState(state);
          if (mapped !== status) {
            status = mapped;
            const update: Record<string, unknown> = { status };
            if (mapped === "connected") {
              update.qr_code = null;
              update.connected_at = new Date().toISOString();
              qr_code = null;
            }
            await admin.from("whatsapp_instances").update(update).eq("channel_id", channel.id);
            const chUpdate: Record<string, unknown> = { status };
            if (mapped === "connected" && inst?.phone_number) chUpdate.phone_number = inst.phone_number;
            await admin.from("channels").update(chUpdate).eq("id", channel.id);
          }
        } catch (_) { /* ignore */ }
      }

      return json({
        status,
        qr_code,
        instance_name: inst?.instance_name ?? null,
        phone_number: inst?.phone_number ?? null,
        channel_id: channel.id,
      });
    }

    if (body.action === "disconnect") {
      if (channel) {
        if (EVO_ENABLED) await evoLogout(instance_name);
        await admin.from("channels").update({ status: "disconnected" }).eq("id", channel.id);
        await admin
          .from("whatsapp_instances")
          .update({ status: "disconnected", qr_code: null, disconnected_at: new Date().toISOString() })
          .eq("channel_id", channel.id);
      }
      return json({ status: "disconnected" });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
