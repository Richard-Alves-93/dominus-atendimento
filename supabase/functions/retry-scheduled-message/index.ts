// retry-scheduled-message: requeue a failed outbound message into scheduled_messages.
// Returns HTTP 200 even on validation failures, with { ok:false, error, code } so
// the frontend can surface a friendly message instead of a generic non-2xx error.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ok = (b: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ ok: true, ...b }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Always HTTP 200 so supabase.functions.invoke() exposes the body on the client.
const fail = (code: string, message: string, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ ok: false, success: false, code, error: message, friendly_reason: message, ...extra }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return fail("unauthenticated", "Sessão expirada. Faça login novamente.");
    const token = auth.slice(7).trim();
    const anon = createClient(SUPABASE_URL, ANON_KEY);
    let userId: string | null = null;
    try {
      const c = await (anon.auth as any).getClaims(token);
      if (c?.data?.claims?.sub) userId = c.data.claims.sub;
    } catch (_) { /* */ }
    if (!userId) {
      const { data, error } = await anon.auth.getUser(token);
      if (error || !data?.user) return fail("unauthenticated", "Sessão expirada. Faça login novamente.");
      userId = data.user.id;
    }

    const { message_id } = await req.json().catch(() => ({} as any));
    if (!message_id) return fail("invalid_payload", "Não foi possível reenviar: identificador da mensagem ausente.");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: m, error: mErr } = await admin
      .from("messages")
      .select("id, company_id, ticket_id, contact_id, channel_id, body, raw_body, status, from_me, failure_reason")
      .eq("id", message_id)
      .maybeSingle();
    if (mErr) return fail("db_error", "Não foi possível reenviar esta mensagem. Tente novamente.", { detail: mErr.message });
    if (!m) return fail("message_not_found", "A mensagem original não foi encontrada.");
    if (!m.from_me) return fail("not_outbound", "Apenas mensagens enviadas podem ser reenviadas.");
    if (m.status !== "failed") return fail("not_failed", "Esta mensagem não pode mais ser reenviada.");

    const [{ data: prof }, { data: member }, { data: ticket }] = await Promise.all([
      admin.from("profiles").select("is_master").eq("id", userId).maybeSingle(),
      admin.from("company_users").select("role")
        .eq("user_id", userId).eq("company_id", m.company_id).eq("status", "active").maybeSingle(),
      m.ticket_id
        ? admin.from("tickets").select("assigned_user_id, channel_id").eq("id", m.ticket_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const isMaster = prof?.is_master === true;
    const role = member?.role ?? null;
    const isAdmin = isMaster || ["owner", "admin", "manager"].includes(role ?? "");
    const isAssignee = (ticket as any)?.assigned_user_id === userId;
    if (!isMaster && !member) return fail("forbidden", "Você não tem permissão para reenviar esta mensagem.");
    if (!isAdmin && !isAssignee) return fail("forbidden", "Você não tem permissão para reenviar esta mensagem.");

    const channelId = m.channel_id ?? (ticket as any)?.channel_id ?? null;
    if (!channelId) return fail("no_channel", "Não foi possível localizar o canal de envio.");

    // Verify there's a connected WhatsApp instance for this company.
    const { data: instance } = await admin
      .from("whatsapp_instances")
      .select("instance_name, status")
      .eq("company_id", m.company_id)
      .eq("status", "connected")
      .maybeSingle();
    if (!instance?.instance_name) {
      return fail("disconnected", "A conexão WhatsApp está desconectada. Reconecte em Conexões e tente novamente.");
    }

    const body = m.raw_body ?? m.body;
    if (!body || !String(body).trim()) {
      return fail("empty_body", "Não foi possível reenviar: conteúdo da mensagem indisponível.");
    }

    const { error: qErr } = await admin.from("scheduled_messages").insert({
      company_id: m.company_id,
      ticket_id: m.ticket_id,
      contact_id: m.contact_id,
      channel_id: channelId,
      channel_type: "whatsapp",
      created_by: userId,
      type: "manual_retry",
      body,
      scheduled_for: new Date().toISOString(),
      status: "pending",
    });
    if (qErr) return fail("queue_error", "Não foi possível reenviar esta mensagem. Tente novamente.", { detail: qErr.message });

    // Mark previous failed row so the UI can hide the retry button.
    await admin.from("messages").update({ failure_reason: (m as any).failure_reason ?? "retried" })
      .eq("id", m.id).then(() => {}, () => {});

    // Best-effort audit log.
    try {
      await admin.from("audit_logs").insert({
        company_id: m.company_id,
        actor_user_id: userId,
        action: "message.retry_enqueued",
        entity_type: "message",
        entity_id: m.id,
        metadata: { ticket_id: m.ticket_id, channel_id: channelId, source: "ui_retry_button" },
      });
    } catch (_) { /* non-blocking */ }

    return ok({ message: "Reenfileirado para envio" });
  } catch (e) {
    return fail("exception", "Não foi possível reenviar esta mensagem. Tente novamente.", { detail: String((e as Error)?.message ?? e) });
  }
});
