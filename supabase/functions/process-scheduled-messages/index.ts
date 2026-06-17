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

function evoBase() {
  return EVO_URL!.replace(/\/$/, "");
}

async function sendWhatsapp(
  admin: ReturnType<typeof createClient>,
  msg: any,
): Promise<{ ok: boolean; reason?: string; externalId?: string | null }> {
  if (!EVO_URL || !EVO_KEY) return { ok: false, reason: "evolution_not_configured" };
  const { data: instance } = await admin
    .from("whatsapp_instances")
    .select("instance_name, status")
    .eq("company_id", msg.company_id)
    .eq("status", "connected")
    .maybeSingle();
  if (!instance?.instance_name) return { ok: false, reason: "no_connected_instance" };

  const { data: contact } = await admin
    .from("contacts")
    .select("phone_number")
    .eq("id", msg.contact_id)
    .maybeSingle();
  const phone = contact?.phone_number?.replace(/\D/g, "") ?? "";
  if (!phone) return { ok: false, reason: "contact_without_phone" };

  const endpoint = `${evoBase()}/message/sendText/${instance.instance_name}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: EVO_KEY },
    body: JSON.stringify({ number: phone, text: msg.body }),
  });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
  if (!res.ok) return { ok: false, reason: `evolution_${res.status}: ${data?.message ?? data?.error ?? "unknown"}` };

  const externalId =
    data?.key?.id ?? data?.message?.key?.id ?? data?.data?.key?.id ??
    data?.response?.key?.id ?? data?.messageId ?? data?.id ?? null;

  // Persist a real message in history (outbound, system-originated automation)
  if (msg.ticket_id) {
    await admin.from("messages").insert({
      company_id: msg.company_id,
      ticket_id: msg.ticket_id,
      contact_id: msg.contact_id,
      channel_id: msg.channel_id,
      direction: "outbound",
      from_me: true,
      msg_type: "text",
      body: msg.body,
      raw_body: msg.body,
      external_id: externalId,
      provider_message_id: externalId,
      source: "automation",
      status: "sent",
      delivery_status: "sent",
      sent_at: new Date().toISOString(),
    });
    await admin.from("tickets").update({ last_message_at: new Date().toISOString() }).eq("id", msg.ticket_id);
  }
  return { ok: true, externalId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Atomic claim: pending -> processing
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
      .from("scheduled_messages")
      .select("*")
      .in("id", ids);

    let ok = 0, failed = 0;
    for (const msg of msgs ?? []) {
      try {
        let result: { ok: boolean; reason?: string };
        if (msg.channel_type === "whatsapp") {
          result = await sendWhatsapp(admin, msg);
        } else {
          result = { ok: false, reason: `channel_not_implemented:${msg.channel_type ?? "unknown"}` };
        }
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
        await admin.from("scheduled_messages").update({
          status: "failed",
          failed_at: new Date().toISOString(),
          failure_reason: String((e as Error)?.message ?? e),
        }).eq("id", msg.id);
      }
    }

    return json({ ok: true, processed: msgs?.length ?? 0, sent: ok, failed });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
