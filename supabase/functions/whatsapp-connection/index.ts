import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface Body {
  action: "create_or_connect" | "status" | "disconnect" | "recreate";
  company_id: string;
  channel_id?: string;
  force?: boolean;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const EVO_URL = Deno.env.get("EVOLUTION_API_URL");
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY");
const EVO_WEBHOOK = Deno.env.get("EVOLUTION_WEBHOOK_URL");
const EVO_ENABLED = Boolean(EVO_URL && EVO_KEY);

console.log("[EVOLUTION_ENV_AUDIT]", {
  has_evolution_api_url: !!EVO_URL,
  has_evolution_api_key: !!EVO_KEY,
  has_webhook_url: !!EVO_WEBHOOK,
  has_app_public_url: !!Deno.env.get("APP_PUBLIC_URL"),
  api_url_host: EVO_URL?.split("//")?.[1]?.split("/")?.[0],
});

const WEBHOOK_EVENTS = [
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

function companySlug(name?: string | null): string {
  const raw = (name ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    .replace(/^_+|_+$/g, "");
  return slug || "empresa";
}

function instanceNameFor(companyId: string, companyName?: string | null) {
  const suffix = companyId.replace(/-/g, "").slice(0, 8);
  return `dominus_${companySlug(companyName)}_${suffix}`;
}

function legacyInstanceNameFor(companyId: string) {
  return `dominus_${companyId.replace(/-/g, "").slice(0, 8)}`;
}

async function resolveNewInstanceName(baseName: string): Promise<string> {
  // Try base, then _v2, _v3... until evolution has no instance with that name
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? baseName : `${baseName}_v${i + 1}`;
    const existing = await evoFetchInstance(candidate);
    if (!existing) return candidate;
  }
  return `${baseName}_v${Date.now()}`;
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
    webhookByEvents: false,
    byEvents: false,
    webhook_base64: true,
    webhookBase64: true,
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
  const endpoints = [`${evoBase()}/webhook/set/${instanceName}`];
  for (const endpoint of endpoints) {
    for (const payload of [body, { webhook: body }]) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: evoHeaders(),
          body: JSON.stringify(payload),
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
}

async function evoCreateInstance(instanceName: string) {
  // Evolution v2.3.7: do NOT embed `webhook` in /instance/create — it rejects the body shape.
  // We sync the webhook afterwards via /webhook/set.
  const body: Record<string, unknown> = {
    instanceName,
    qrcode: true,
    integration: "WHATSAPP-BAILEYS",
  };
  const res = await fetch(`${evoBase()}/instance/create`, {
    method: "POST",
    headers: evoHeaders(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
  console.log("[EVOLUTION_QR_AUDIT]", {
    action: "create",
    instance_name: instanceName,
    endpoint_path: "/instance/create",
    evolution_status: res.status,
    evolution_response_truncated: text.slice(0, 300),
  });
  if (!res.ok) {
    const msg = String(data?.response?.message ?? data?.message ?? "");
    if (res.status === 403 || res.status === 409 || msg.includes("already")) {
      return await evoConnect(instanceName);
    }
    const nested = data?.response?.message ?? data?.message ?? data?.error ?? text;
    const detail = (typeof nested === "string" ? nested : JSON.stringify(nested)).slice(0, 240);
    throw new Error(`Evolution ${res.status}: ${detail}`);
  }
  const qr = data?.qrcode?.base64 ?? data?.qrcode?.code ?? null;
  return { qr_code: ensureDataUrl(qr), status: "pending" as const };
}

async function evoConnect(instanceName: string) {
  const res = await fetch(`${evoBase()}/instance/connect/${instanceName}`, {
    headers: evoHeaders(),
  });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
  console.log("[EVOLUTION_QR_AUDIT]", {
    action: "connect",
    instance_name: instanceName,
    endpoint_path: "/instance/connect",
    evolution_status: res.status,
    evolution_response_truncated: text.slice(0, 300),
  });
  if (!res.ok) {
    const nested = data?.response?.message ?? data?.message ?? data?.error ?? text;
    const detail = (typeof nested === "string" ? nested : JSON.stringify(nested)).slice(0, 240);
    throw new Error(`Evolution ${res.status}: ${detail}`);
  }
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
  // Evolution v2.3.x: DELETE /instance/logout/{instance}
  const res = await fetch(`${evoBase()}/instance/logout/${instanceName}`, {
    method: "DELETE",
    headers: evoHeaders(),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String((e as Error)?.message ?? e) } as any));
  const text = await (res as Response).text().catch(() => "");
  console.log("[EVOLUTION_DISCONNECT_RESPONSE]", {
    status: (res as Response).status,
    ok: (res as Response).ok,
    body_raw_truncated: text.slice(0, 240),
    endpoint_path: `/instance/logout/${instanceName}`,
  });
  return { ok: (res as Response).ok, status: (res as Response).status, body: text };
}

async function evoDeleteInstance(instanceName: string) {
  // Evolution v2.3.x: DELETE /instance/delete/{instance}
  const res = await fetch(`${evoBase()}/instance/delete/${instanceName}`, {
    method: "DELETE",
    headers: evoHeaders(),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String((e as Error)?.message ?? e) } as any));
  const text = await (res as Response).text().catch(() => "");
  console.log("[EVOLUTION_DELETE_RESPONSE]", {
    status: (res as Response).status,
    ok: (res as Response).ok,
    body_raw_truncated: text.slice(0, 240),
    endpoint_path: `/instance/delete/${instanceName}`,
  });
  return { ok: (res as Response).ok, status: (res as Response).status, body: text };
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

    // Load company name to build the slug-based instance name
    const { data: companyRow } = await admin
      .from("companies")
      .select("name")
      .eq("id", body.company_id)
      .maybeSingle();
    const desiredBaseName = instanceNameFor(body.company_id, companyRow?.name);
    const legacyName = legacyInstanceNameFor(body.company_id);

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

      // Reuse stored instance_name if it still exists on Evolution (stability rule).
      const { data: existingInst } = await admin
        .from("whatsapp_instances")
        .select("id, instance_name")
        .eq("channel_id", channel.id)
        .maybeSingle();

      let instance_name: string;
      const storedName = existingInst?.instance_name ?? null;

      if (storedName && (await evoFetchInstance(storedName))) {
        // Keep existing connected/active instance — do NOT rename.
        instance_name = storedName;
      } else if (storedName === legacyName && (await evoFetchInstance(legacyName))) {
        instance_name = legacyName;
      } else {
        // No live Evolution instance — generate a fresh name with the new pattern,
        // resolving collisions via _v2, _v3, ...
        instance_name = await resolveNewInstanceName(desiredBaseName);
      }

      console.log("[EVOLUTION_INSTANCE_NAME_RESOLVED]", {
        company_id: body.company_id,
        company_name: companyRow?.name ?? null,
        desired_base: desiredBaseName,
        stored: storedName,
        chosen: instance_name,
      });

      // Try connect first (works if instance already exists); otherwise create.
      let evo: { qr_code: string | null; status: "pending" };
      const existing = await evoFetchInstance(instance_name);
      if (existing) {
        evo = await evoConnect(instance_name);
      } else {
        evo = await evoCreateInstance(instance_name);
      }

      let webhookOk = false;
      let webhookErr: string | null = null;
      try {
        await evoSyncWebhook(instance_name);
        webhookOk = true;
      } catch (e) {
        webhookErr = (e as Error)?.message ?? "unknown";
      }

      const syncFields = webhookOk
        ? {
            webhook_configured: true,
            events_configured: true,
            last_settings_sync_at: new Date().toISOString(),
            settings_sync_error: null,
          }
        : { settings_sync_error: webhookErr };

      if (existingInst) {
        await admin
          .from("whatsapp_instances")
          .update({ status: "pending", qr_code: evo.qr_code, instance_name, ...syncFields })
          .eq("id", existingInst.id);
      } else {
        await admin.from("whatsapp_instances").insert({
          company_id: body.company_id,
          channel_id: channel.id,
          instance_name,
          status: "pending",
          qr_code: evo.qr_code,
          ...syncFields,
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
      if (!channel) return json({ status: "disconnected" });

      const { data: inst } = await admin
        .from("whatsapp_instances")
        .select("instance_name, status")
        .eq("channel_id", channel.id)
        .maybeSingle();

      const target = inst?.instance_name ?? desiredBaseName;
      const local_status_before = inst?.status ?? channel.status ?? "unknown";

      console.log("[EVOLUTION_DISCONNECT_AUDIT_START]", {
        company_id: body.company_id,
        channel_id: channel.id,
        instance_name: target,
        local_status_before,
        endpoint_path: `/instance/logout/${target}`,
      });

      if (!EVO_ENABLED) {
        return json({ error: "Evolution API não configurada.", status: local_status_before }, 200);
      }

      const logout = await evoLogout(target);

      // Verify real state on Evolution
      let evoState = "unknown";
      try {
        const { state } = await evoConnectionState(target);
        evoState = state ?? "unknown";
      } catch (_) { /* ignore */ }

      const mapped = mapState(evoState);
      const reallyDisconnected = mapped === "disconnected";

      console.log("[EVOLUTION_DISCONNECT_STATE_CHECK]", {
        instance_name: target,
        evolution_state_after: evoState,
        decision: reallyDisconnected ? "update_db_disconnected" : "keep_db_state",
      });

      if (reallyDisconnected) {
        await admin.from("channels").update({ status: "disconnected" }).eq("id", channel.id);
        await admin
          .from("whatsapp_instances")
          .update({ status: "disconnected", qr_code: null, disconnected_at: new Date().toISOString() })
          .eq("channel_id", channel.id);

        console.log("[EVOLUTION_DISCONNECT_AUDIT_END]", {
          local_status_after: "disconnected",
          success: true,
          failure_reason: null,
        });
        return json({ status: "disconnected", instance_name: target });
      }

      const failure_reason = logout.ok
        ? `Evolution ainda reporta estado "${evoState}" após logout.`
        : `Logout falhou (HTTP ${logout.status}): ${logout.body.slice(0, 160)}`;

      console.log("[EVOLUTION_DISCONNECT_AUDIT_END]", {
        local_status_after: body.force ? "disconnected" : local_status_before,
        success: !!body.force,
        failure_reason,
      });

      // Force fallback: mark local as disconnected so user can recreate.
      if (body.force) {
        await admin.from("channels").update({ status: "disconnected" }).eq("id", channel.id);
        await admin
          .from("whatsapp_instances")
          .update({
            status: "disconnected",
            qr_code: null,
            disconnected_at: new Date().toISOString(),
            settings_sync_error: failure_reason.slice(0, 240),
          })
          .eq("channel_id", channel.id);
        return json({
          status: "disconnected",
          instance_name: target,
          forced: true,
          evolution_state: evoState,
          warning: "Instância inconsistente na Evolution. Status local marcado como desconectado.",
        });
      }

      return json({
        error: "A instância está inconsistente na Evolution. Recrie a conexão para gerar um novo QR Code.",
        evolution_state: evoState,
        status: mapped,
        instance_name: target,
        can_recreate: true,
      }, 200);
    }

    if (body.action === "recreate") {
      if (!EVO_ENABLED) {
        return json({ error: "Evolution API não configurada." }, 500);
      }

      const { data: inst } = channel
        ? await admin
            .from("whatsapp_instances")
            .select("id, instance_name")
            .eq("channel_id", channel.id)
            .maybeSingle()
        : { data: null as any };

      const oldName = inst?.instance_name ?? null;

      console.log("[EVOLUTION_RECREATE_AUDIT_START]", {
        company_id: body.company_id,
        channel_id: channel?.id ?? null,
        old_instance_name: oldName,
      });

      // Best-effort cleanup on Evolution (do NOT delete internal data).
      if (oldName) {
        try { await evoLogout(oldName); } catch (_) { /* ignore */ }
        try { await evoDeleteInstance(oldName); } catch (_) { /* ignore */ }
      }

      // Ensure channel exists
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

      // Generate a fresh instance name (avoiding collision with the old one and others on Evolution).
      const newName = await resolveNewInstanceName(desiredBaseName);
      const evo = await evoCreateInstance(newName);

      let webhookErr: string | null = null;
      try { await evoSyncWebhook(newName); } catch (e) { webhookErr = (e as Error)?.message ?? "unknown"; }

      const syncFields = webhookErr
        ? { settings_sync_error: webhookErr }
        : {
            webhook_configured: true,
            events_configured: true,
            last_settings_sync_at: new Date().toISOString(),
            settings_sync_error: null,
          };

      if (inst) {
        await admin
          .from("whatsapp_instances")
          .update({
            instance_name: newName,
            status: "pending",
            qr_code: evo.qr_code,
            phone_number: null,
            connected_at: null,
            disconnected_at: new Date().toISOString(),
            ...syncFields,
          })
          .eq("id", inst.id);
      } else {
        await admin.from("whatsapp_instances").insert({
          company_id: body.company_id,
          channel_id: channel.id,
          instance_name: newName,
          status: "pending",
          qr_code: evo.qr_code,
          ...syncFields,
        });
      }

      console.log("[EVOLUTION_RECREATE_AUDIT_END]", {
        company_id: body.company_id,
        channel_id: channel.id,
        old_instance_name: oldName,
        new_instance_name: newName,
        webhook_error: webhookErr,
      });

      return json({
        status: "pending",
        qr_code: evo.qr_code,
        instance_name: newName,
        channel_id: channel.id,
        recreated: true,
        old_instance_name: oldName,
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    const message = (e as Error)?.message ?? String(e);
    console.error("[EVOLUTION_API_ERROR]", { message: message.slice(0, 300) });
    return json({ error: message, status: "error" }, 200);
  }
});
