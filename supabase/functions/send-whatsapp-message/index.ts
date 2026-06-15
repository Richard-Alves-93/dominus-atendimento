import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVO_URL = Deno.env.get("EVOLUTION_API_URL");
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY");

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

// Background: ship the message to Evolution and patch the row with the final status.
async function dispatchToEvolution(params: {
  admin: ReturnType<typeof createClient>;
  messageId: string;
  ticketId: string;
  endpoint: string;
  phone: string;
  finalText: string;
}) {
  const { admin, messageId, ticketId, endpoint, phone, finalText } = params;
  const t0 = performance.now();
  try {
    const evoRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVO_KEY! },
      body: JSON.stringify({ number: phone, text: finalText }),
    });
    const evoText = await evoRes.text();
    let evoData: any = {};
    try { evoData = JSON.parse(evoText); } catch { evoData = { raw: evoText.slice(0, 300) }; }

    if (!evoRes.ok) {
      console.error("[SEND_WA] evolution_fail", evoRes.status, evoData?.message ?? evoData?.error);
      await admin.from("messages").update({
        delivery_status: "failed",
        status: "failed",
        failed_at: new Date().toISOString(),
        failure_reason: `Evolution ${evoRes.status}: ${evoData?.message ?? evoData?.error ?? "unknown"}`,
        raw: evoData,
      }).eq("id", messageId);
      return;
    }

    const externalId =
      evoData?.key?.id ?? evoData?.messageId ?? evoData?.message?.key?.id ?? null;
    const nowIso = new Date().toISOString();

    await Promise.all([
      admin.from("messages").update({
        delivery_status: "sent",
        status: "sent",
        external_id: externalId,
        provider_message_id: externalId,
        sent_at: nowIso,
        raw: evoData,
      }).eq("id", messageId),
      admin.from("tickets").update({ last_message_at: nowIso, status: "open" }).eq("id", ticketId),
    ]);
    console.log("[SEND_WA] dispatched ms=", Math.round(performance.now() - t0));
  } catch (e) {
    console.error("[SEND_WA] dispatch_exception", (e as Error)?.message);
    await admin.from("messages").update({
      delivery_status: "failed",
      status: "failed",
      failed_at: new Date().toISOString(),
      failure_reason: String((e as Error)?.message ?? e),
    }).eq("id", messageId);
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
    const endpoint = `${EVO_URL.replace(/\/$/, "")}/message/sendText/${instance.instance_name}`;

    const sp = senderRes.data;
    const senderName = sp?.public_name ?? sp?.full_name ?? null;
    const sigRaw =
      (sp?.signature && sp.signature.trim()) ||
      (sp?.public_name && sp.public_name.trim()) ||
      (sp?.full_name && sp.full_name.trim()) || "";
    const signatureLine = sp?.signature_enabled && sigRaw ? sigRaw : null;
    const finalText = signatureLine ? `*${signatureLine}:*\n${text}` : text;
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
        sent_by_signature: signatureLine,
        status: "sending",
        delivery_status: "sending",
      })
      .select("id").single();
    if (insErr) return fail("db_insert", "Failed to save message", { detail: insErr.message });
    const tIns = Math.round(performance.now() - tIns0);

    // Bump ticket timestamp in background
    admin.from("tickets")
      .update({ last_message_at: nowIso, status: "open" })
      .eq("id", ticket_id)
      .then(() => {}, (e: any) => console.error("[SEND_WA] ticket bump failed", e?.message));

    // Background dispatch to Evolution
    const bg = dispatchToEvolution({
      admin, messageId: inserted.id, ticketId: ticket_id, endpoint, phone, finalText,
    });
    try { (globalThis as any).EdgeRuntime?.waitUntil?.(bg); } catch (_) {}

    const tTotal = Math.round(performance.now() - tStart);
    console.log("[SEND_WA] times ms", { auth: tAuth, ctx: tCtx, insert: tIns, total: tTotal });

    return json({
      ok: true,
      message_id: inserted.id,
      delivery_status: "sending",
      timings: { auth: tAuth, ctx: tCtx, insert: tIns, total: tTotal },
    });
  } catch (e) {
    return fail("exception", String((e as Error)?.message ?? e));
  }
});
