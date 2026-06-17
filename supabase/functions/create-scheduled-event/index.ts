import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fmtDateTimeBR(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const time = d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  return { date, time };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ ok: false, error: "Missing bearer token" }, 401);
    }
    const token = authHeader.slice(7).trim();
    const anonClient = createClient(SUPABASE_URL, ANON_KEY);
    let userId: string | null = null;
    try {
      const claimsRes = await (anonClient.auth as any).getClaims(token);
      if (claimsRes?.data?.claims?.sub) userId = claimsRes.data.claims.sub as string;
    } catch (_) { /* fall through */ }
    if (!userId) {
      const { data: userData, error: userErr } = await anonClient.auth.getUser(token);
      if (userErr || !userData?.user) return json({ ok: false, error: "Invalid session" }, 401);
      userId = userData.user.id;
    }

    const payload = await req.json().catch(() => ({} as any));
    const {
      company_id,
      ticket_id = null,
      contact_id = null,
      channel_id = null,
      assigned_user_id = null,
      title,
      description = null,
      start_at,
      end_at = null,
      location = null,
      meeting_enabled = false,
      meeting_url = null,
      send_confirmation = false,
      reminder_1h_enabled = false,
      reminder_5m_enabled = false,
    } = payload ?? {};

    if (!company_id || !title?.trim() || !start_at) {
      return json({ ok: false, error: "company_id, title, start_at são obrigatórios" }, 400);
    }
    const startAtIso = new Date(start_at).toISOString();
    if (Number.isNaN(new Date(start_at).getTime())) {
      return json({ ok: false, error: "start_at inválido" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Authz: master OR active member of company
    const [{ data: prof }, { data: member }] = await Promise.all([
      admin.from("profiles").select("is_master, full_name, public_name").eq("id", userId).maybeSingle(),
      admin.from("company_users").select("role")
        .eq("user_id", userId).eq("company_id", company_id).eq("status", "active").maybeSingle(),
    ]);
    const isMaster = prof?.is_master === true;
    if (!isMaster && !member) return json({ ok: false, error: "Forbidden" }, 403);
    const role = member?.role ?? null;
    const canAssignOthers = isMaster || ["owner", "admin", "manager"].includes(role ?? "");

    const finalAssigned = assigned_user_id && canAssignOthers ? assigned_user_id : userId;

    // Validate ticket / contact / channel ownership
    let resolvedChannelType: string | null = null;
    if (ticket_id) {
      const { data: t } = await admin.from("tickets")
        .select("id, company_id, contact_id, channel_id")
        .eq("id", ticket_id).maybeSingle();
      if (!t || t.company_id !== company_id) return json({ ok: false, error: "ticket inválido" }, 400);
    }
    if (contact_id) {
      const { data: c } = await admin.from("contacts").select("id, company_id").eq("id", contact_id).maybeSingle();
      if (!c || c.company_id !== company_id) return json({ ok: false, error: "contato inválido" }, 400);
    }
    if (channel_id) {
      const { data: ch } = await admin.from("channels")
        .select("id, company_id, channel_type").eq("id", channel_id).maybeSingle();
      if (!ch || ch.company_id !== company_id) return json({ ok: false, error: "canal inválido" }, 400);
      resolvedChannelType = ch.channel_type;
    }

    // Insert event
    const { data: event, error: evErr } = await admin
      .from("scheduled_events")
      .insert({
        company_id,
        ticket_id,
        contact_id,
        channel_id,
        channel_type: resolvedChannelType,
        created_by: userId,
        assigned_user_id: finalAssigned,
        title: title.trim(),
        description,
        start_at: startAtIso,
        end_at: end_at ? new Date(end_at).toISOString() : null,
        location,
        meeting_enabled: !!meeting_enabled,
        meeting_url: meeting_enabled ? (meeting_url ?? null) : null,
        send_confirmation: !!send_confirmation && !!channel_id && !!contact_id,
        reminder_1h_enabled: !!reminder_1h_enabled && !!channel_id && !!contact_id,
        reminder_5m_enabled: !!reminder_5m_enabled && !!channel_id && !!contact_id,
        status: "scheduled",
      })
      .select("*")
      .single();
    if (evErr) return json({ ok: false, error: evErr.message }, 400);

    // System message in ticket history (if event was created from a ticket)
    if (ticket_id && contact_id) {
      const senderName = prof?.public_name ?? prof?.full_name ?? "Usuário";
      const { date, time } = fmtDateTimeBR(startAtIso);
      const onlineSuffix = meeting_enabled ? " com reunião online" : "";
      const sysBody = `${senderName} criou o evento "${title.trim()}" para ${date} às ${time}${onlineSuffix}.`;
      await admin.from("messages").insert({
        company_id,
        ticket_id,
        contact_id,
        channel_id,
        direction: "outbound",
        from_me: false,
        msg_type: "system",
        body: sysBody,
        raw_body: sysBody,
        sent_by_user_id: userId,
        sent_by_name: senderName,
        source: "system",
        status: "system",
        delivery_status: "system",
      });
    }

    // Scheduled messages (only if channel + contact present)
    if (channel_id && contact_id) {
      const startMs = new Date(startAtIso).getTime();
      const dt = fmtDateTimeBR(startAtIso);
      const venue = location ? ` em ${location}` : "";
      const meet = meeting_enabled && meeting_url ? `\nLink da reunião: ${meeting_url}` : "";
      const queue: Array<{ type: string; body: string; scheduled_for: string }> = [];

      if (send_confirmation) {
        queue.push({
          type: "event_confirmation",
          body: `Olá! Confirmando nosso compromisso "${title.trim()}" em ${dt.date} às ${dt.time}${venue}.${meet}`,
          scheduled_for: new Date().toISOString(),
        });
      }
      if (reminder_1h_enabled) {
        const at = new Date(startMs - 60 * 60 * 1000);
        if (at.getTime() > Date.now()) {
          queue.push({
            type: "event_reminder_1h",
            body: `Lembrete: nosso compromisso "${title.trim()}" começa em 1 hora (${dt.time}).${meet}`,
            scheduled_for: at.toISOString(),
          });
        }
      }
      if (reminder_5m_enabled) {
        const at = new Date(startMs - 5 * 60 * 1000);
        if (at.getTime() > Date.now()) {
          queue.push({
            type: "event_reminder_5m",
            body: `Lembrete: nosso compromisso "${title.trim()}" começa em 5 minutos.${meet}`,
            scheduled_for: at.toISOString(),
          });
        }
      }
      if (queue.length > 0) {
        await admin.from("scheduled_messages").insert(
          queue.map((q) => ({
            company_id,
            ticket_id,
            contact_id,
            channel_id,
            channel_type: resolvedChannelType,
            event_id: event.id,
            created_by: userId,
            type: q.type,
            body: q.body,
            scheduled_for: q.scheduled_for,
            status: "pending",
          })),
        );
      }
    }

    // Audit
    await admin.from("audit_logs").insert({
      company_id,
      event_type: "scheduled_event.create",
      changed_by: userId,
      metadata: { event_id: event.id, title: event.title, start_at: event.start_at, has_channel: !!channel_id },
    }).then(() => {}, () => {});

    return json({ ok: true, event });
  } catch (e) {
    console.error("[CREATE_EVENT] exception", (e as Error)?.message);
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
