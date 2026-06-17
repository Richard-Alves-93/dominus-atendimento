import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVO_URL = Deno.env.get("EVOLUTION_API_URL");
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY");

const BATCH_SIZE = 25;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function evoBase() { return EVO_URL!.replace(/\/$/, ""); }
function maskPhone(p: string) {
  if (!p) return "";
  if (p.length <= 4) return "***" + p;
  return p.slice(0, 4) + "***" + p.slice(-2);
}

async function sendWhatsapp(
  admin: ReturnType<typeof createClient>,
  msg: any,
): Promise<{ ok: boolean; reason?: string; externalId?: string | null; messageId?: string }> {
  if (!EVO_URL || !EVO_KEY) return { ok: false, reason: "evolution_not_configured" };

  const { data: instance } = await admin
    .from("whatsapp_instances")
    .select("instance_name, status")
    .eq("company_id", msg.company_id)
    .eq("status", "connected")
    .maybeSingle();
  if (!instance?.instance_name) return { ok: false, reason: "no_connected_instance" };

  const { data: contact } = await admin
    .from("contacts").select("phone_number").eq("id", msg.contact_id).maybeSingle();
  const phone = (contact?.phone_number ?? "").replace(/\D/g, "");
  if (!phone) return { ok: false, reason: "contact_without_phone" };

  // Insert history row as 'sending' FIRST so the ticket UI gets it via realtime immediately.
  let historyId: string | null = null;
  if (msg.ticket_id) {
    const { data: ins, error: insErr } = await admin.from("messages").insert({
      company_id: msg.company_id,
      ticket_id: msg.ticket_id,
      contact_id: msg.contact_id,
      channel_id: msg.channel_id,
      direction: "outbound",
      from_me: true,
      msg_type: "text",
      body: msg.body,
      raw_body: msg.body,
      source: "automation",
      status: "sending",
      delivery_status: "sending",
    }).select("id").single();
    if (insErr) console.error("[SCHEDULED_PIPELINE_AUDIT] history_insert_failed", insErr.message);
    historyId = ins?.id ?? null;
  }

  const endpoint = `${evoBase()}/message/sendText/${instance.instance_name}`;
  // SAME contract as send-whatsapp-message — do NOT add linkPreview here (Evolution v2.3.7 rejects it).
  const payload = { number: phone, text: msg.body };

  console.log("[EVOLUTION_PAYLOAD_AUDIT]", {
    scheduled_message_id: msg.id,
    instance_name: instance.instance_name,
    number_masked: maskPhone(phone),
    has_text: !!msg.body,
    text_length: (msg.body ?? "").length,
    payload_shape: "number+text",
  });

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVO_KEY },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    const reason = `evolution_network: ${String((e as Error)?.message ?? e).slice(0, 160)}`;
    if (historyId) {
      await admin.from("messages").update({
        status: "failed", delivery_status: "failed",
        failed_at: new Date().toISOString(), failure_reason: reason,
      }).eq("id", historyId);
    }
    return { ok: false, reason, messageId: historyId ?? undefined };
  }

  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }

  if (!res.ok) {
    const nested =
      data?.response?.message ??
      data?.response?.error ??
      data?.message ??
      data?.error ??
      data?.raw ??
      "unknown";
    const detail = (typeof nested === "string" ? nested : JSON.stringify(nested)).slice(0, 400);
    const reason = `evolution_${res.status}: ${detail}`;
    console.error("[EVOLUTION_SEND_RESPONSE]", {
      scheduled_message_id: msg.id,
      status: res.status,
      body_raw: text.slice(0, 600),
      payload_shape: "number+text",
      number_len: phone.length,
      text_len: (msg.body ?? "").length,
    });
    if (historyId) {
      await admin.from("messages").update({
        status: "failed", delivery_status: "failed",
        failed_at: new Date().toISOString(), failure_reason: reason,
      }).eq("id", historyId);
    }
    return { ok: false, reason, messageId: historyId ?? undefined };
  }

  const externalId =
    data?.key?.id ?? data?.message?.key?.id ?? data?.data?.key?.id ??
    data?.response?.key?.id ?? data?.messageId ?? data?.id ?? null;

  const nowIso = new Date().toISOString();
  if (historyId) {
    await admin.from("messages").update({
      status: "sent",
      delivery_status: "sent",
      sent_at: nowIso,
      external_id: externalId,
      provider_message_id: externalId,
    }).eq("id", historyId);
  }
  if (msg.ticket_id) {
    await admin.from("tickets").update({ last_message_at: nowIso }).eq("id", msg.ticket_id);
  }
  return { ok: true, externalId, messageId: historyId ?? undefined };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const nowIso = new Date().toISOString();
    const { data: claimed, error: claimErr } = await admin
      .from("scheduled_messages")
      .select("id")
      .eq("status", "pending")
      .lte("scheduled_for", nowIso)
      .limit(BATCH_SIZE);
    if (claimErr) return json({ ok: false, error: claimErr.message }, 500);
    if (!claimed?.length) return json({ ok: true, processed: 0 });

    const ids = claimed.map((c) => c.id);
    await admin
      .from("scheduled_messages")
      .update({ status: "processing", updated_at: nowIso })
      .in("id", ids)
      .eq("status", "pending");

    const { data: msgs } = await admin
      .from("scheduled_messages").select("*").in("id", ids);

    let ok = 0, failed = 0;
    for (const msg of msgs ?? []) {
      try {
        console.log("[SCHEDULED_PIPELINE_AUDIT]", {
          scheduled_message_id: msg.id,
          event_id: msg.event_id,
          ticket_id: msg.ticket_id,
          type: msg.type,
          channel_type: msg.channel_type,
          scheduled_for: msg.scheduled_for,
          now: new Date().toISOString(),
          status_before: "processing",
        });
        const result = msg.channel_type === "whatsapp"
          ? await sendWhatsapp(admin, msg)
          : { ok: false, reason: `channel_not_implemented:${msg.channel_type ?? "unknown"}` };

        console.log("[SCHEDULED_PIPELINE_AUDIT]", {
          scheduled_message_id: msg.id,
          status_after: result.ok ? "sent" : "failed",
          failure_reason: result.ok ? null : result.reason,
        });

        if (result.ok) {
          ok++;
          await admin.from("scheduled_messages").update({
            status: "sent",
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", msg.id);
        } else {
          failed++;
          await admin.from("scheduled_messages").update({
            status: "failed",
            failed_at: new Date().toISOString(),
            failure_reason: result.reason ?? "unknown",
            updated_at: new Date().toISOString(),
          }).eq("id", msg.id);
        }
      } catch (e) {
        failed++;
        const reason = String((e as Error)?.message ?? e).slice(0, 200);
        await admin.from("scheduled_messages").update({
          status: "failed",
          failed_at: new Date().toISOString(),
          failure_reason: reason,
        }).eq("id", msg.id);
        console.error("[SCHEDULED_PIPELINE_AUDIT] exception", { id: msg.id, reason });
      }
    }

    return json({ ok: true, processed: msgs?.length ?? 0, sent: ok, failed });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
