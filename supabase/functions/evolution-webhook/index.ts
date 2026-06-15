import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ensureDataUrl(qr?: string | null): string | null {
  if (!qr) return null;
  if (qr.startsWith("data:")) return qr;
  return `data:image/png;base64,${qr}`;
}

function jidToPhone(jid?: string | null): string | null {
  if (!jid) return null;
  return String(jid).split("@")[0].split(":")[0] || null;
}

function detectMsgType(m: any): string {
  const msg = m?.message ?? {};
  if (msg.conversation || msg.extendedTextMessage) return "text";
  if (msg.imageMessage) return "image";
  if (msg.audioMessage) return "audio";
  if (msg.videoMessage) return "video";
  if (msg.documentMessage) return "document";
  if (msg.stickerMessage) return "sticker";
  if (msg.locationMessage) return "location";
  if (msg.contactMessage) return "contact";
  return "other";
}

function extractBody(m: any): string | null {
  const msg = m?.message ?? {};
  return (
    msg.conversation ??
    msg.extendedTextMessage?.text ??
    msg.imageMessage?.caption ??
    msg.videoMessage?.caption ??
    msg.documentMessage?.caption ??
    null
  );
}

async function handleMessageUpsert(admin: any, inst: any, payload: any) {
  const dataArr = Array.isArray(payload?.data) ? payload.data : [payload?.data].filter(Boolean);
  for (const m of dataArr) {
    const key = m?.key ?? {};
    const remoteJid: string | undefined = key.remoteJid;
    if (!remoteJid || remoteJid.endsWith("@g.us")) continue; // skip groups for now
    const fromMe = Boolean(key.fromMe);
    const phone = jidToPhone(remoteJid);
    const externalId = key.id ?? null;
    const pushName = m?.pushName ?? null;

    // upsert contact
    let contactId: string | null = null;
    const { data: existingContact } = await admin
      .from("contacts")
      .select("id, name")
      .eq("company_id", inst.company_id)
      .eq("phone_number", phone)
      .maybeSingle();
    if (existingContact) {
      contactId = existingContact.id;
      if (!existingContact.name && pushName) {
        await admin.from("contacts").update({ name: pushName }).eq("id", contactId);
      }
    } else {
      const { data: created } = await admin
        .from("contacts")
        .insert({ company_id: inst.company_id, phone_number: phone, name: pushName })
        .select("id")
        .single();
      contactId = created?.id ?? null;
    }
    if (!contactId) continue;

    // find or create open ticket
    let { data: ticket } = await admin
      .from("tickets")
      .select("id, unread_count")
      .eq("company_id", inst.company_id)
      .eq("contact_id", contactId)
      .neq("status", "closed")
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!ticket) {
      const { data: created } = await admin
        .from("tickets")
        .insert({
          company_id: inst.company_id,
          contact_id: contactId,
          channel_id: inst.channel_id,
          status: "open",
          last_message_at: new Date().toISOString(),
        })
        .select("id, unread_count")
        .single();
      ticket = created;
    }
    if (!ticket) continue;

    const msgType = detectMsgType(m);
    const body = extractBody(m);
    const sentAt = m?.messageTimestamp
      ? new Date(Number(m.messageTimestamp) * 1000).toISOString()
      : new Date().toISOString();

    await admin.from("messages").upsert(
      {
        company_id: inst.company_id,
        ticket_id: ticket.id,
        contact_id: contactId,
        channel_id: inst.channel_id,
        direction: fromMe ? "outbound" : "inbound",
        msg_type: msgType,
        body,
        external_id: externalId,
        provider_message_id: externalId,
        from_me: fromMe,
        delivery_status: fromMe ? "sent" : "received",
        raw: m,
        sent_at: sentAt,
      },
      { onConflict: "channel_id,external_id" },
    );

    await admin
      .from("tickets")
      .update({
        last_message_at: sentAt,
        unread_count: fromMe ? ticket.unread_count : (ticket.unread_count ?? 0) + 1,
        status: "open",
      })
      .eq("id", ticket.id);
}

// Maps Evolution/Baileys status values to our delivery_status.
// Strings: PENDING, SERVER_ACK, DELIVERY_ACK, READ, PLAYED
// Numbers: 0 ERROR, 1 PENDING, 2 SERVER_ACK(sent), 3 DELIVERY_ACK(delivered), 4 READ, 5 PLAYED
function mapDeliveryStatus(raw: any): { status: string | null; ts: string } {
  const ts = new Date().toISOString();
  if (raw === null || raw === undefined) return { status: null, ts };
  const v = typeof raw === "string" ? raw.toUpperCase() : raw;
  if (v === 0 || v === "ERROR" || v === "FAILED") return { status: "failed", ts };
  if (v === 2 || v === "SERVER_ACK" || v === "SENT") return { status: "sent", ts };
  if (v === 3 || v === "DELIVERY_ACK" || v === "DELIVERED") return { status: "delivered", ts };
  if (v === 4 || v === 5 || v === "READ" || v === "PLAYED") return { status: "read", ts };
  return { status: null, ts };
}

async function handleMessageUpdate(admin: any, inst: any, payload: any) {
  const dataArr = Array.isArray(payload?.data) ? payload.data : [payload?.data].filter(Boolean);
  for (const u of dataArr) {
    const providerId: string | undefined =
      u?.keyId ?? u?.key?.id ?? u?.messageId ?? u?.id;
    if (!providerId) continue;
    const statusRaw = u?.status ?? u?.update?.status ?? u?.messageStatus;
    const { status, ts } = mapDeliveryStatus(statusRaw);
    if (!status) continue;

    const patch: Record<string, unknown> = { delivery_status: status, status };
    if (status === "delivered") patch.delivered_at = ts;
    if (status === "read") {
      patch.read_at = ts;
      // ensure delivered_at is set too
      patch.delivered_at = ts;
    }
    if (status === "failed") {
      patch.failed_at = ts;
      patch.failure_reason = u?.error ?? u?.reason ?? u?.message ?? "unknown";
    }

    await admin
      .from("messages")
      .update(patch)
      .eq("company_id", inst.company_id)
      .or(`provider_message_id.eq.${providerId},external_id.eq.${providerId}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({} as any));
    const event: string = payload?.event ?? "";
    const instanceName: string | undefined =
      payload?.instance ?? payload?.instanceName ?? payload?.data?.instance;

    if (!instanceName) return json({ ok: true, skipped: "no instance" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: inst } = await admin
      .from("whatsapp_instances")
      .select("id, channel_id, company_id")
      .eq("instance_name", instanceName)
      .maybeSingle();

    if (!inst) {
      await admin.from("channel_sync_logs").insert({
        company_id: null,
        channel_id: null,
        event_type: event || "unknown",
        payload,
        status: "ignored",
      });
      return json({ ok: true, skipped: "unknown instance" });
    }

    const normalized = event.toUpperCase().replace(/\./g, "_");

    if (normalized === "QRCODE_UPDATED") {
      const qr = ensureDataUrl(
        payload?.data?.qrcode?.base64 ?? payload?.data?.qrcode ?? payload?.qrcode?.base64,
      );
      await admin
        .from("whatsapp_instances")
        .update({ status: "pending", qr_code: qr })
        .eq("id", inst.id);
      await admin.from("channels").update({ status: "pending" }).eq("id", inst.channel_id);
    } else if (normalized === "CONNECTION_UPDATE") {
      const state: string = payload?.data?.state ?? payload?.state ?? "";
      let status: "connected" | "pending" | "disconnected" = "disconnected";
      if (state === "open") status = "connected";
      else if (state === "connecting") status = "pending";

      const update: Record<string, unknown> = { status };
      const phone = jidToPhone(payload?.data?.wuid ?? payload?.data?.number ?? null);
      if (status === "connected") {
        update.qr_code = null;
        update.connected_at = new Date().toISOString();
        if (phone) update.phone_number = phone;
      } else if (status === "disconnected") {
        update.disconnected_at = new Date().toISOString();
        update.qr_code = null;
      }
      await admin.from("whatsapp_instances").update(update).eq("id", inst.id);
      const channelUpdate: Record<string, unknown> = { status };
      if (status === "connected" && phone) channelUpdate.phone_number = phone;
      await admin.from("channels").update(channelUpdate).eq("id", inst.channel_id);
    } else if (normalized === "MESSAGES_UPSERT") {
      await handleMessageUpsert(admin, inst, payload);
    }

    await admin.from("channel_sync_logs").insert({
      company_id: inst.company_id,
      channel_id: inst.channel_id,
      event_type: event || "unknown",
      payload,
      status: "ok",
    });

    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
