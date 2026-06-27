import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVO_URL = Deno.env.get("EVOLUTION_API_URL");
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY");
const EVO_WEBHOOK = Deno.env.get("EVOLUTION_WEBHOOK_URL");

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
function fail(step: string, message: string, extra: Record<string, unknown> = {}) {
  console.error("[SEND_WA] fail", step, message, extra);
  return json({ ok: false, error: message, step, ...extra }, 200);
}

function evoBase() {
  return EVO_URL!.replace(/\/$/, "");
}

function maskPhone(p: string) {
  if (!p) return "";
  if (p.length <= 4) return "***" + p;
  return p.slice(0, 4) + "***" + p.slice(-2);
}

async function syncEvolutionWebhook(instanceName: string) {
  if (!EVO_WEBHOOK) return;
  const body = {
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
  const endpoints = [`${evoBase()}/webhook/set/${instanceName}`];
  for (const endpoint of endpoints) {
    for (const payload of [body, { webhook: body }]) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: EVO_KEY! },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          console.log("[SEND_WA] webhook_sync_ok events=", WEBHOOK_EVENTS);
          return;
        }
        const text = await res.text().catch(() => "");
        console.warn("[SEND_WA] webhook_sync_failed", res.status, text.slice(0, 160));
      } catch (e) {
        console.warn("[SEND_WA] webhook_sync_exception", (e as Error)?.message);
      }
    }
  }
}

// Foreground: ship the message to Evolution and patch the row with the final status.
// Returns a structured result so the HTTP response reflects the real outcome.
async function dispatchToEvolution(params: {
  admin: ReturnType<typeof createClient>;
  messageId: string;
  ticketId: string;
  endpoint: string;
  instanceName: string;
  phone: string;
  finalText: string;
  quotedProviderId?: string | null;
  quotedFromMe?: boolean;
  quotedText?: string | null;
}): Promise<{ ok: boolean; status?: number; externalId?: string | null; failureReason?: string; friendlyReason?: string; connectionLost?: boolean; bodyRaw?: string; quoteFallbackUsed?: boolean }> {
  const { admin, messageId, ticketId, endpoint, instanceName, phone, finalText, quotedProviderId, quotedFromMe, quotedText } = params;
  let quoteFallbackUsed = false;
  try {
    await syncEvolutionWebhook(instanceName);
    const basePayload: Record<string, unknown> = { number: phone, text: finalText };
    let payload: Record<string, unknown> = basePayload;
    if (quotedProviderId) {
      const remoteJid = `${phone}@s.whatsapp.net`;
      payload = {
        ...basePayload,
        quoted: {
          key: { id: quotedProviderId, remoteJid, fromMe: !!quotedFromMe },
          message: { conversation: (quotedText ?? "").slice(0, 1024) || " " },
        },
      };
    }
    let evoRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVO_KEY! },
      body: JSON.stringify(payload),
    });
    if (!evoRes.ok && quotedProviderId) {
      const failTxt = await evoRes.text().catch(() => "");
      console.warn("[WHATSAPP_REPLY_QUOTE_FALLBACK]", {
        message_id: messageId,
        status: evoRes.status,
        detail_truncated: failTxt.slice(0, 200),
      });
      quoteFallbackUsed = true;
      evoRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVO_KEY! },
        body: JSON.stringify(basePayload),
      });
    }
    const evoText = await evoRes.text();
    let evoData: any = {};
    try { evoData = JSON.parse(evoText); } catch { evoData = { raw: evoText.slice(0, 300) }; }

    if (!evoRes.ok) {
      const nested =
        evoData?.response?.message ??
        evoData?.response?.error ??
        evoData?.message ??
        evoData?.error ??
        null;
      const detail = (typeof nested === "string" ? nested : JSON.stringify(nested ?? evoData)).slice(0, 400);
      const failureReason = `evolution_${evoRes.status}: ${detail}`;
      const lowered = `${detail} ${evoText}`.toLowerCase();
      const connectionLost =
        lowered.includes("error connection") ||
        lowered.includes("connection closed") ||
        lowered.includes("not connected") ||
        lowered.includes("connection is not open") ||
        lowered.includes("instance not connected") ||
        lowered.includes("instance is not connected");
      const friendlyReason = connectionLost
        ? "WhatsApp desconectado. Reconecte a instância em Conexões."
        : `Falha no provedor WhatsApp (HTTP ${evoRes.status}).`;
      console.error("[EVOLUTION_SEND_RESPONSE]", {
        message_id: messageId,
        status: evoRes.status,
        ok: false,
        connection_lost: connectionLost,
        body_raw_truncated: evoText.slice(0, 600),
        error_message_truncated: detail.slice(0, 300),
        payload_shape: "number+text",
        number_len: phone.length,
        text_len: finalText.length,
      });
      await admin.from("messages").update({
        delivery_status: "failed",
        status: "failed",
        failed_at: new Date().toISOString(),
        failure_reason: failureReason,
        raw: evoData,
      }).eq("id", messageId);
      return { ok: false, status: evoRes.status, failureReason, friendlyReason, connectionLost, bodyRaw: evoText.slice(0, 300) };
    }

    const externalId =
      evoData?.key?.id ??
      evoData?.message?.key?.id ??
      evoData?.data?.key?.id ??
      evoData?.response?.key?.id ??
      evoData?.messageId ??
      evoData?.id ??
      evoData?.keyId ??
      null;
    console.log("[EVOLUTION_SEND_RESPONSE]", {
      message_id: messageId,
      status: evoRes.status,
      ok: true,
      external_id: externalId,
      keys: Object.keys(evoData ?? {}),
    });

    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = {
      delivery_status: "sent",
      status: "sent",
      sent_at: nowIso,
      raw: evoData,
    };
    if (externalId) {
      patch.external_id = externalId;
      patch.provider_message_id = externalId;
    }

    const { error: updErr } = await admin.from("messages").update(patch).eq("id", messageId);
    if (updErr) console.error("[SEND_WA] update_after_send_failed", updErr.message);
    await admin.from("tickets").update({ last_message_at: nowIso, status: "open" }).eq("id", ticketId);

    return { ok: true, status: evoRes.status, externalId, quoteFallbackUsed };
  } catch (e) {
    const failureReason = String((e as Error)?.message ?? e).slice(0, 300);
    console.error("[EVOLUTION_SEND_RESPONSE]", { message_id: messageId, ok: false, exception: failureReason });
    await admin.from("messages").update({
      delivery_status: "failed",
      status: "failed",
      failed_at: new Date().toISOString(),
      failure_reason: `exception: ${failureReason}`,
    }).eq("id", messageId);
    return { ok: false, failureReason: `exception: ${failureReason}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const tStart = performance.now();
  try {
    if (!EVO_URL || !EVO_KEY) return fail("config", "Evolution API not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ ok: false, error: "Missing bearer token", step: "auth" }, 401);
    }
    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) return json({ ok: false, error: "Missing bearer token", step: "auth" }, 401);

    // ---- auth (JWT verify, no session_id dependency) ----
    const tAuth0 = performance.now();
    const anonClient = createClient(SUPABASE_URL, ANON_KEY);
    let userId: string | null = null;
    try {
      const claimsRes = await (anonClient.auth as any).getClaims(token);
      if (claimsRes?.data?.claims?.sub) userId = claimsRes.data.claims.sub as string;
    } catch (_) { /* fallthrough */ }
    if (!userId) {
      const { data: userData, error: userErr } = await anonClient.auth.getUser(token);
      if (userErr || !userData?.user) {
        return json({ ok: false, error: "Invalid session", step: "auth", detail: userErr?.message }, 401);
      }
      userId = userData.user.id;
    }
    const tAuth = Math.round(performance.now() - tAuth0);

    const payload = await req.json().catch(() => ({} as any));
    const company_id = payload.company_id;
    const ticket_id = payload.ticket_id;
    const text: string | undefined = payload.text ?? payload.body ?? payload.message;
    const skipSignature: boolean = payload.skip_signature === true;
    const reply = (payload.reply && typeof payload.reply === "object") ? payload.reply : null;

    if (!company_id || !ticket_id || !text?.trim()) {
      return fail("payload", "Invalid payload (company_id, ticket_id, text required)");
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // ---- authz + ticket + contact + instance + sender (parallel) ----
    const tCtx0 = performance.now();
    const [profileRes, memberRes, ticketRes, instanceRes, senderRes] = await Promise.all([
      admin.from("profiles").select("is_master").eq("id", userId).maybeSingle(),
      admin.from("company_users").select("id")
        .eq("user_id", userId).eq("company_id", company_id).eq("status", "active").maybeSingle(),
      admin.from("tickets").select("id, company_id, contact_id, channel_id")
        .eq("id", ticket_id).eq("company_id", company_id).maybeSingle(),
      admin.from("whatsapp_instances")
        .select("instance_name, channel_id, status")
        .eq("company_id", company_id).eq("status", "connected").maybeSingle(),
      admin.from("profiles")
        .select("full_name, public_name, signature, signature_enabled")
        .eq("id", userId).maybeSingle(),
    ]);

    const allowed = profileRes.data?.is_master === true || Boolean(memberRes.data);
    if (!allowed) return fail("authz", "Forbidden");

    const ticket = ticketRes.data;
    if (!ticket) return fail("ticket", "Ticket not found");

    const instance = instanceRes.data;
    if (!instance?.instance_name) return fail("instance", "No connected WhatsApp instance");

    // contact (needs ticket.contact_id, so issue after)
    const { data: contact } = await admin
      .from("contacts").select("id, phone_number").eq("id", ticket.contact_id).maybeSingle();
    const phone = contact?.phone_number?.replace(/\D/g, "") ?? "";
    if (!phone) return fail("contact", "Contact has no phone");

    const channelId = ticket.channel_id ?? instance.channel_id;
    const endpoint = `${evoBase()}/message/sendText/${instance.instance_name}`;

    const sp = senderRes.data;
    const senderName = sp?.public_name ?? sp?.full_name ?? null;
    const sigRaw =
      (sp?.signature && sp.signature.trim()) ||
      (sp?.public_name && sp.public_name.trim()) ||
      (sp?.full_name && sp.full_name.trim()) || "";
    const signatureLine = sp?.signature_enabled && sigRaw ? sigRaw : null;
    const signatureLineEffective = skipSignature ? null : signatureLine;
    const finalText = signatureLineEffective ? `*${signatureLineEffective}:*\n${text}` : text;
    const tCtx = Math.round(performance.now() - tCtx0);

    // ---- insert message as 'sending' ----
    const tIns0 = performance.now();
    const nowIso = new Date().toISOString();
    const { data: inserted, error: insErr } = await admin
      .from("messages")
      .insert({
        company_id, ticket_id,
        contact_id: contact!.id,
        channel_id: channelId,
        direction: "outbound",
        from_me: true,
        msg_type: "text",
        body: finalText,
        raw_body: text,
        sent_by_user_id: userId,
        sent_by_name: senderName,
        sent_by_signature: signatureLineEffective,
        status: "sending",
        delivery_status: "sending",
        reply_to_message_id: reply?.message_id ?? null,
        reply_to_provider_message_id: reply?.provider_message_id ?? null,
        reply_to_preview: reply?.preview ? String(reply.preview).slice(0, 280) : null,
        reply_to_sender_name: reply?.sender_name ?? null,
        reply_to_message_type: reply?.message_type ?? null,
      })
      .select("id").single();
    if (insErr) return fail("db_insert", "Failed to save message", { detail: insErr.message });
    const tIns = Math.round(performance.now() - tIns0);

    console.log("[WHATSAPP_SEND_AUDIT_START]", {
      company_id, ticket_id,
      contact_id: contact!.id,
      channel_id: channelId,
      channel_type: "whatsapp",
      instance_name: instance.instance_name,
      destination_masked: maskPhone(phone),
      payload_shape: reply?.provider_message_id ? "number+text+quoted" : "number+text",
      message_id: inserted.id,
      has_reply: !!reply,
    });

    // Foreground dispatch — HTTP response must reflect the real Evolution outcome.
    const result = await dispatchToEvolution({
      admin, messageId: inserted.id, ticketId: ticket_id, endpoint,
      instanceName: instance.instance_name, phone, finalText,
      quotedProviderId: reply?.provider_message_id ?? null,
      quotedFromMe: reply?.from_me === true,
      quotedText: reply?.preview ?? null,
    });

    if (reply) {
      console.log("[WHATSAPP_REPLY_SEND_AUDIT]", {
        message_id: inserted.id,
        had_provider_id: !!reply?.provider_message_id,
        quote_fallback_used: result.quoteFallbackUsed === true,
        final_ok: result.ok,
      });
    }

    const tTotal = Math.round(performance.now() - tStart);
    console.log("[WHATSAPP_SEND_AUDIT_END]", {
      message_id: inserted.id,
      status_final: result.ok ? "sent" : "failed",
      provider_message_id: result.externalId ?? null,
      failure_reason: result.failureReason ?? null,
      total_ms: tTotal,
    });

    if (!result.ok) {
      return json({
        ok: false,
        success: false,
        status: "failed",
        message_id: inserted.id,
        failure_reason: result.failureReason ?? "unknown",
        evolution_status: result.status ?? null,
        body_raw: result.bodyRaw ?? null,
      });
    }

    return json({
      ok: true,
      success: true,
      message_id: inserted.id,
      delivery_status: "sent",
      provider_message_id: result.externalId ?? null,
      timings: { auth: tAuth, ctx: tCtx, insert: tIns, total: tTotal },
    });
  } catch (e) {
    return fail("exception", String((e as Error)?.message ?? e));
  }
});
