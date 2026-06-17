// manage-scheduled-event: actions reschedule | update | cancel
// All sensitive scheduled_messages writes for reschedule/update/cancel happen here.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function fmtBR(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    time: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }),
  };
}

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

    const body = await req.json().catch(() => ({} as any));
    const { action, event_id } = body ?? {};
    if (!action || !event_id) return j({ ok: false, error: "action e event_id obrigatórios" }, 400);
    if (!["reschedule", "update", "cancel"].includes(action)) {
      return j({ ok: false, error: "action inválida" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Load event
    const { data: event, error: evErr } = await admin
      .from("scheduled_events")
      .select("*")
      .eq("id", event_id)
      .maybeSingle();
    if (evErr || !event) return j({ ok: false, error: "Evento não encontrado" }, 404);

    // Authz: master OR active member, AND permission to edit
    const [{ data: prof }, { data: member }] = await Promise.all([
      admin.from("profiles").select("is_master, full_name, public_name").eq("id", userId).maybeSingle(),
      admin.from("company_users").select("role")
        .eq("user_id", userId).eq("company_id", event.company_id).eq("status", "active").maybeSingle(),
    ]);
    const isMaster = prof?.is_master === true;
    const role = member?.role ?? null;
    const isAdmin = isMaster || ["owner", "admin"].includes(role ?? "");
    if (!isMaster && !member) return j({ ok: false, error: "Forbidden" }, 403);
    const canEdit = isAdmin || event.assigned_user_id === userId || event.created_by === userId;
    if (!canEdit) return j({ ok: false, error: "Sem permissão para editar este evento" }, 403);

    const senderName = prof?.public_name ?? prof?.full_name ?? "Usuário";
    const hasExternalChannel =
      !!event.ticket_id && !!event.contact_id && !!event.channel_id && event.channel_type === "whatsapp";

    // ---------- CANCEL ----------
    if (action === "cancel") {
      const reason = String(body.cancel_reason ?? "").trim();
      if (!reason) return j({ ok: false, error: "Motivo obrigatório" }, 400);
      if (event.status === "cancelled") return j({ ok: true, event });

      const { error: upErr } = await admin
        .from("scheduled_events")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancelled_by: userId,
          cancel_reason: reason,
        })
        .eq("id", event.id);
      if (upErr) return j({ ok: false, error: upErr.message }, 400);

      // Trigger cancel_event_scheduled_messages will mark pending->cancelled.
      // Now (after that) insert the cancellation external message so it stays pending.
      if (hasExternalChannel) {
        // Cancel any still-pending confirmation/reminders for this event
        await admin
          .from("scheduled_messages")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("event_id", event.id)
          .in("status", ["pending", "processing"])
          .in("type", ["event_confirmation", "event_reminder_1h", "event_reminder_5m", "event_rescheduled", "event_updated"]);

        const cancelBody = `Olá! Nosso compromisso "${event.title}" marcado para ${fmtBR(event.start_at).date} às ${fmtBR(event.start_at).time} foi cancelado.${reason ? `\nMotivo: ${reason}` : ""}\nSe precisar, podemos reagendar um novo horário.`;
        const { data: insMsg, error: insErr } = await admin.from("scheduled_messages").insert({
          company_id: event.company_id,
          ticket_id: event.ticket_id,
          contact_id: event.contact_id,
          channel_id: event.channel_id,
          channel_type: event.channel_type,
          event_id: event.id,
          created_by: userId,
          type: "event_cancellation",
          body: cancelBody,
          scheduled_for: new Date().toISOString(),
          status: "pending",
        }).select("id").maybeSingle();
        if (insErr) console.error("[EVENT_CANCEL_NOTIFY_AUDIT] insert_failed", insErr.message);
        console.log("[EVENT_CANCEL_NOTIFY_AUDIT]", {
          event_id: event.id,
          company_id: event.company_id,
          ticket_id: event.ticket_id,
          contact_id: event.contact_id,
          channel_id: event.channel_id,
          cancel_reason_present: !!reason,
          created_scheduled_message_id: insMsg?.id ?? null,
          send_mode: "scheduled_immediate",
        });
      }


      // Internal note in ticket
      if (event.ticket_id && event.contact_id) {
        const note = `${senderName} cancelou o evento "${event.title}". Motivo: ${reason}.`;
        await admin.from("messages").insert({
          company_id: event.company_id,
          ticket_id: event.ticket_id,
          contact_id: event.contact_id,
          channel_id: event.channel_id,
          direction: "outbound",
          from_me: false,
          msg_type: "system",
          body: note,
          raw_body: note,
          sent_by_user_id: userId,
          sent_by_name: senderName,
          source: "system",
          status: "system",
          delivery_status: "system",
        });
      }

      await admin.from("audit_logs").insert({
        company_id: event.company_id,
        event_type: "scheduled_event.cancel",
        changed_by: userId,
        ticket_id: event.ticket_id,
        reason,
        metadata: { event_id: event.id },
      }).then(() => {}, () => {});

      return j({ ok: true });
    }

    // ---------- RESCHEDULE / UPDATE ----------
    const {
      title, description, start_at, end_at, location,
      meeting_enabled, meeting_url,
    } = body ?? {};

    if (!title?.trim() || !start_at) return j({ ok: false, error: "title e start_at obrigatórios" }, 400);
    const newStartIso = new Date(start_at).toISOString();
    if (Number.isNaN(new Date(start_at).getTime())) return j({ ok: false, error: "start_at inválido" }, 400);
    const newEndIso = end_at ? new Date(end_at).toISOString() : null;
    const newMeetUrl = meeting_enabled ? (meeting_url?.trim() || null) : null;

    const dateTimeChanged =
      new Date(event.start_at).toISOString() !== newStartIso ||
      (event.end_at ?? null) !== (newEndIso ?? null);
    const meetingChanged =
      event.meeting_enabled !== !!meeting_enabled ||
      (event.meeting_url ?? "") !== (newMeetUrl ?? "");

    const { error: upErr } = await admin
      .from("scheduled_events")
      .update({
        title: title.trim(),
        description: description?.trim() || null,
        start_at: newStartIso,
        end_at: newEndIso,
        location: location?.trim() || null,
        meeting_enabled: !!meeting_enabled,
        meeting_url: newMeetUrl,
      })
      .eq("id", event.id);
    if (upErr) {
      if (upErr.message?.includes("SCHEDULE_CONFLICT")) {
        return j({ ok: false, code: "SCHEDULE_CONFLICT", error: "Este responsável já possui um agendamento nesse horário." }, 409);
      }
      return j({ ok: false, error: upErr.message }, 400);
    }

    const { date, time } = fmtBR(newStartIso);
    const meetLine = !!meeting_enabled && newMeetUrl ? `\nLink da reunião: ${newMeetUrl}` : "";

    if (dateTimeChanged) {
      // Cancel old pending reminders + previous immediate notifications still pending
      // (include event_confirmation that may still be pending)
      await admin
        .from("scheduled_messages")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("event_id", event.id)
        .in("status", ["pending", "processing"])
        .in("type", ["event_confirmation", "event_reminder_1h", "event_reminder_5m", "event_rescheduled", "event_updated"]);

      // Recreate reminders (skip past-due)
      const startMs = new Date(newStartIso).getTime();
      const now = Date.now();
      const queue: Array<{ type: string; body: string; scheduled_for: string }> = [];
      if (hasExternalChannel) {
        const r1 = new Date(startMs - 60 * 60 * 1000);
        if (event.reminder_1h_enabled && r1.getTime() > now) {
          queue.push({
            type: "event_reminder_1h",
            body: `Lembrete: nosso compromisso "${title.trim()}" começa em 1 hora (${time}).${meetLine}`,
            scheduled_for: r1.toISOString(),
          });
        } else if (event.reminder_1h_enabled) {
          console.log("[SCHEDULED_MESSAGE_TIMING_AUDIT]", { event_id: event.id, type: "event_reminder_1h", skipped: "past_due", start_at: newStartIso });
        }
        const r5 = new Date(startMs - 5 * 60 * 1000);
        if (event.reminder_5m_enabled && r5.getTime() > now) {
          queue.push({
            type: "event_reminder_5m",
            body: `Lembrete: nosso compromisso "${title.trim()}" começa em 5 minutos.${meetLine}`,
            scheduled_for: r5.toISOString(),
          });
        } else if (event.reminder_5m_enabled) {
          console.log("[SCHEDULED_MESSAGE_TIMING_AUDIT]", { event_id: event.id, type: "event_reminder_5m", skipped: "past_due", start_at: newStartIso });
        }
        // Immediate reschedule notification
        const isMeet = !!meeting_enabled && !!newMeetUrl;
        const locationLine = !isMeet && location?.trim() ? `\nLocal: ${location.trim()}` : "";
        queue.push({
          type: "event_rescheduled",
          body: `Olá! Nosso compromisso "${title.trim()}" foi reagendado para ${date} às ${time}.${meetLine}${locationLine}\nSe precisar ajustar novamente, nos avise.`,
          scheduled_for: new Date().toISOString(),
        });

        if (queue.length) {
          const { data: insRows, error: insErr } = await admin.from("scheduled_messages").insert(
            queue.map((q) => ({
              company_id: event.company_id,
              ticket_id: event.ticket_id,
              contact_id: event.contact_id,
              channel_id: event.channel_id,
              channel_type: event.channel_type,
              event_id: event.id,
              created_by: userId,
              type: q.type,
              body: q.body,
              scheduled_for: q.scheduled_for,
              status: "pending",
            })),
          ).select("id, type");
          if (insErr) console.error("[EVENT_RESCHEDULE_NOTIFY_AUDIT] insert_failed", insErr.message);
          const rescheduledRow = (insRows ?? []).find((r: any) => r.type === "event_rescheduled");
          console.log("[EVENT_RESCHEDULE_NOTIFY_AUDIT]", {
            event_id: event.id,
            company_id: event.company_id,
            ticket_id: event.ticket_id,
            contact_id: event.contact_id,
            channel_id: event.channel_id,
            old_start_at: event.start_at,
            new_start_at: newStartIso,
            created_scheduled_message_id: rescheduledRow?.id ?? null,
            queued_count: insRows?.length ?? 0,
            send_mode: "scheduled_immediate",
          });
        }
      }


      if (event.ticket_id && event.contact_id) {
        const note = `${senderName} reagendou o evento "${title.trim()}" para ${date} às ${time}.`;
        await admin.from("messages").insert({
          company_id: event.company_id,
          ticket_id: event.ticket_id,
          contact_id: event.contact_id,
          channel_id: event.channel_id,
          direction: "outbound",
          from_me: false,
          msg_type: "system",
          body: note,
          raw_body: note,
          sent_by_user_id: userId,
          sent_by_name: senderName,
          source: "system",
          status: "system",
          delivery_status: "system",
        });
      }
    } else if (meetingChanged && hasExternalChannel) {
      // Same date/time, only meeting/details changed
      await admin.from("scheduled_messages").insert({
        company_id: event.company_id,
        ticket_id: event.ticket_id,
        contact_id: event.contact_id,
        channel_id: event.channel_id,
        channel_type: event.channel_type,
        event_id: event.id,
        created_by: userId,
        type: "event_updated",
        body: `Olá! Seu agendamento foi atualizado.\nData: ${date} às ${time}.${meetLine}`,
        scheduled_for: new Date().toISOString(),
        status: "pending",
      });
    }

    await admin.from("audit_logs").insert({
      company_id: event.company_id,
      event_type: dateTimeChanged ? "scheduled_event.reschedule" : "scheduled_event.update",
      changed_by: userId,
      ticket_id: event.ticket_id,
      metadata: { event_id: event.id, dateTimeChanged, meetingChanged },
    }).then(() => {}, () => {});

    return j({ ok: true });
  } catch (e) {
    console.error("[MANAGE_EVENT] exception", (e as Error)?.message);
    return j({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
