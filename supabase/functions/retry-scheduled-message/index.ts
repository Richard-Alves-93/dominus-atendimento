// retry-scheduled-message: requeue a failed outbound message into scheduled_messages.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return j({ ok: false, error: "Missing bearer token" }, 401);
    const token = auth.slice(7).trim();
    const anon = createClient(SUPABASE_URL, ANON_KEY);
    let userId: string | null = null;
    try {
      const c = await (anon.auth as any).getClaims(token);
      if (c?.data?.claims?.sub) userId = c.data.claims.sub;
    } catch (_) { /* */ }
    if (!userId) {
      const { data, error } = await anon.auth.getUser(token);
      if (error || !data?.user) return j({ ok: false, error: "Invalid session" }, 401);
      userId = data.user.id;
    }

    const { message_id } = await req.json().catch(() => ({} as any));
    if (!message_id) return j({ ok: false, error: "message_id obrigatório" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: m, error: mErr } = await admin
      .from("messages")
      .select("id, company_id, ticket_id, contact_id, channel_id, body, raw_body, status, from_me")
      .eq("id", message_id)
      .maybeSingle();
    if (mErr || !m) return j({ ok: false, error: "Mensagem não encontrada" }, 404);
    if (!m.from_me) return j({ ok: false, error: "Apenas mensagens enviadas podem ser reenviadas" }, 400);
    if (m.status !== "failed") return j({ ok: false, error: "Mensagem não está com falha" }, 400);

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
    const isAssignee = ticket?.assigned_user_id === userId;
    if (!isMaster && !member) return j({ ok: false, error: "Forbidden" }, 403);
    if (!isAdmin && !isAssignee) return j({ ok: false, error: "Sem permissão para reenviar" }, 403);

    const channelId = m.channel_id ?? ticket?.channel_id ?? null;

    const { error: qErr } = await admin.from("scheduled_messages").insert({
      company_id: m.company_id,
      ticket_id: m.ticket_id,
      contact_id: m.contact_id,
      channel_id: channelId,
      channel_type: "whatsapp",
      created_by: userId,
      type: "manual_retry",
      body: m.raw_body ?? m.body,
      scheduled_for: new Date().toISOString(),
      status: "pending",
    });
    if (qErr) return j({ ok: false, error: qErr.message }, 400);

    // Mark previous failed row so the UI can hide the retry button.
    await admin.from("messages").update({ failure_reason: (m as any).failure_reason ?? "retried" })
      .eq("id", m.id).then(() => {}, () => {});

    return j({ ok: true });
  } catch (e) {
    return j({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
