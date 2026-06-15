import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVO_URL = Deno.env.get("EVOLUTION_API_URL") ?? "";
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";
const MEDIA_BUCKET = "message-media";

function extOfMime(mime?: string | null, fallback = "bin"): string {
  if (!mime) return fallback;
  const m = mime.toLowerCase();
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("mp4")) return "mp4";
  if (m.includes("webm")) return "webm";
  if (m.includes("quicktime")) return "mov";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mpeg") && m.startsWith("audio")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("pdf")) return "pdf";
  if (m.includes("msword")) return "doc";
  if (m.includes("wordprocessingml")) return "docx";
  if (m.includes("spreadsheetml")) return "xlsx";
  if (m.includes("presentationml")) return "pptx";
  if (m.includes("zip")) return "zip";
  if (m.includes("plain")) return "txt";
  return fallback;
}

function extractMediaInfo(m: any) {
  const msg = m?.message ?? {};
  const candidates: Array<[string, any]> = [
    ["image", msg.imageMessage],
    ["audio", msg.audioMessage],
    ["video", msg.videoMessage],
    ["document", msg.documentMessage ?? msg.documentWithCaptionMessage?.message?.documentMessage],
    ["sticker", msg.stickerMessage],
  ];
  for (const [type, mm] of candidates) {
    if (!mm) continue;
    return {
      type,
      mime: mm.mimetype ?? mm.mimeType ?? null,
      fileName: mm.fileName ?? mm.title ?? null,
      size: mm.fileLength ? Number(mm.fileLength) : null,
      duration: mm.seconds ?? null,
      caption: mm.caption ?? null,
      providerId: mm.mediaKey ?? null,
    };
  }
  return null;
}

function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function fetchMediaBase64(instanceName: string, m: any): Promise<string | null> {
  // 1) Payload may already contain base64 (webhook_base64=true).
  const inline =
    m?.message?.base64 ??
    m?.message?.mediaBase64 ??
    m?.media?.base64 ??
    m?.base64 ??
    null;
  if (typeof inline === "string" && inline.length > 0) return inline;

  // 2) Ask Evolution to provide the base64.
  if (!EVO_URL || !EVO_KEY) return null;
  const url = `${EVO_URL.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${instanceName}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVO_KEY },
      body: JSON.stringify({ message: { key: m?.key, message: m?.message }, convertToMp4: false }),
    });
    if (!res.ok) {
      console.warn("[WEBHOOK] media_fetch_failed", res.status, await res.text().catch(() => "").then(t => t.slice(0, 120)));
      return null;
    }
    const data: any = await res.json().catch(() => ({}));
    return data?.base64 ?? data?.data?.base64 ?? null;
  } catch (e) {
    console.warn("[WEBHOOK] media_fetch_exception", (e as Error)?.message);
    return null;
  }
}

async function persistMedia(
  admin: any,
  inst: any,
  ticketId: string,
  externalId: string | null,
  info: ReturnType<typeof extractMediaInfo>,
  m: any,
  instanceName: string,
): Promise<{ storage_path: string | null; mime: string | null; size: number | null; fileName: string | null }> {
  if (!info) return { storage_path: null, mime: null, size: null, fileName: null };
  const base64 = await fetchMediaBase64(instanceName, m);
  if (!base64) return { storage_path: null, mime: info.mime, size: info.size, fileName: info.fileName };
  let bytes: Uint8Array;
  try { bytes = b64ToBytes(base64); } catch { return { storage_path: null, mime: info.mime, size: info.size, fileName: info.fileName }; }
  const ext = extOfMime(info.mime, info.type === "sticker" ? "webp" : info.type === "audio" ? "ogg" : "bin");
  const safeName = (info.fileName && info.fileName.replace(/[^\w.\-]+/g, "_")) || `${info.type}.${ext}`;
  const fileName = safeName.includes(".") ? safeName : `${safeName}.${ext}`;
  const idPart = externalId?.replace(/[^\w-]+/g, "_") || crypto.randomUUID();
  const path = `${inst.company_id}/${inst.channel_id}/${ticketId}/${idPart}/${fileName}`;
  const { error } = await admin.storage.from(MEDIA_BUCKET).upload(path, bytes, {
    contentType: info.mime ?? "application/octet-stream",
    upsert: true,
  });
  if (error) {
    console.warn("[WEBHOOK] media_upload_failed", error.message);
    return { storage_path: null, mime: info.mime, size: info.size, fileName };
  }
  return { storage_path: path, mime: info.mime, size: bytes.byteLength, fileName };
}

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

// Maps Evolution/Baileys status values to our delivery_status.
// Strings: PENDING, SERVER_ACK, DELIVERY_ACK, READ, PLAYED
// Numbers: 0 ERROR, 1 PENDING, 2 SERVER_ACK(sent), 3 DELIVERY_ACK(delivered), 4 READ, 5 PLAYED
function mapDeliveryStatus(raw: any): { status: string | null; ts: string } {
  const ts = new Date().toISOString();
  if (raw === null || raw === undefined) return { status: null, ts };
  const v = typeof raw === "string" ? raw.toUpperCase() : raw;
  if (v === 0 || v === "ERROR" || v === "FAILED" || v === -1) return { status: "failed", ts };
  if (v === 2 || v === "SERVER_ACK" || v === "SENT" || v === "ACK") return { status: "sent", ts };
  if (v === 3 || v === "DELIVERY_ACK" || v === "DELIVERED") return { status: "delivered", ts };
  if (v === 4 || v === 5 || v === "READ" || v === "PLAYED" || v === "READ_SELF") return { status: "read", ts };
  return { status: null, ts };
}

function auditStatus(event: string, instanceName: string | null, providerId: string | null, statusRaw: any, mapped: string | null, rows?: number) {
  console.log(
    `[WEBHOOK_STATUS_AUDIT] event=${event} instance=${instanceName ?? ""} messageId=${providerId ?? ""} rawStatus=${statusRaw ?? ""} mappedStatus=${mapped ?? ""} rowsUpdated=${rows ?? ""}`,
  );
}

async function patchOutboundStatus(admin: any, inst: any, providerId: string | null, statusRaw: any, source: string) {
  const mapped = mapDeliveryStatus(statusRaw);
  const ts = mapped.ts;
  const status = source === "send_message" && (mapped.status === "delivered" || mapped.status === "read")
    ? "sent"
    : mapped.status;
  console.log("[WEBHOOK] msg_update keyId=", providerId, "rawStatus=", statusRaw, "mapped=", status, "source=", source);
  if (!providerId || !status) {
    auditStatus(source, inst.instance_name ?? null, providerId, statusRaw, status, 0);
    return 0;
  }

  const patch: Record<string, unknown> = { delivery_status: status, status };
  if (status === "delivered") patch.delivered_at = ts;
  if (status === "read") {
    patch.read_at = ts;
    patch.delivered_at = ts;
  }
  if (status === "failed") {
    patch.failed_at = ts;
    patch.failure_reason = "status_webhook";
  }

  const { data: updated, error } = await admin
    .from("messages")
    .update(patch)
    .eq("company_id", inst.company_id)
    .eq("channel_id", inst.channel_id)
    .eq("from_me", true)
    .or(`provider_message_id.eq.${providerId},external_id.eq.${providerId}`)
    .select("id");
  if (error) {
    console.error("[WEBHOOK] msg_update_err", error.message);
    auditStatus(source, inst.instance_name ?? null, providerId, statusRaw, status, 0);
    return 0;
  }
  console.log("[WEBHOOK] msg_update_rows=", updated?.length ?? 0);
  auditStatus(source, inst.instance_name ?? null, providerId, statusRaw, status, updated?.length ?? 0);
  return updated?.length ?? 0;
}

async function handleMessageUpsert(admin: any, inst: any, payload: any, source = "messages_upsert") {
  const dataArr = Array.isArray(payload?.data) ? payload.data : [payload?.data].filter(Boolean);
  for (const m of dataArr) {
    const key = m?.key ?? {};
    const remoteJid: string | undefined = key.remoteJid;
    if (!remoteJid || remoteJid.endsWith("@g.us")) continue;
    const fromMe = Boolean(key.fromMe);
    const phone = jidToPhone(remoteJid);
    const externalId: string | null = key.id ?? null;
    const pushName = m?.pushName ?? null;
    const statusRaw = m?.status ?? m?.messageStatus ?? m?.update?.status ?? m?.update?.messageStatus;

    // ── Outbound (fromMe): we already created this message in send-whatsapp-message.
    // Just patch the existing row by external_id / provider_message_id so we don't duplicate.
    if (fromMe) {
      if (!externalId) {
        console.log("[WEBHOOK] upsert_fromMe_no_keyId skip");
        continue;
      }
      const { data: existing } = await admin
        .from("messages")
        .select("id, provider_message_id, external_id")
        .eq("company_id", inst.company_id)
        .eq("channel_id", inst.channel_id)
        .eq("from_me", true)
        .or(`external_id.eq.${externalId},provider_message_id.eq.${externalId}`)
        .limit(1)
        .maybeSingle();
      if (existing) {
        const { status } = mapDeliveryStatus(statusRaw);
        const patch: Record<string, unknown> = {
          external_id: externalId,
          provider_message_id: externalId,
        };
        if (status) {
          patch.delivery_status = status;
          patch.status = status;
          const now = new Date().toISOString();
          if (status === "delivered") patch.delivered_at = now;
          if (status === "read") {
            patch.delivered_at = now;
            patch.read_at = now;
          }
        }
        await admin.from("messages").update(patch).eq("id", existing.id);
        if (status) console.log("[WEBHOOK] msg_update_rows=", 1);
        auditStatus(source, inst.instance_name ?? null, externalId, statusRaw, status ?? null, status ? 1 : 0);
      } else {
        // Mensagem enviada diretamente pelo WhatsApp (celular), não pelo Dominus.
        // Criar contato/ticket se necessário e inserir como from_me=true / source=whatsapp_device.
        console.log("[WEBHOOK] upsert_fromMe_device keyId=", externalId);
        const { status: mappedStatus } = mapDeliveryStatus(statusRaw);

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
        if (!contactId) {
          auditStatus(source, inst.instance_name ?? null, externalId, statusRaw, mappedStatus, 0);
          continue;
        }

        let { data: ticket } = await admin
          .from("tickets")
          .select("id, status")
          .eq("company_id", inst.company_id)
          .eq("contact_id", contactId)
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
            .select("id, status")
            .single();
          ticket = created;
        }
        if (!ticket) {
          auditStatus(source, inst.instance_name ?? null, externalId, statusRaw, mappedStatus, 0);
          continue;
        }

        const msgType = detectMsgType(m);
        const body = extractBody(m);
        const sentAt = m?.messageTimestamp
          ? new Date(Number(m.messageTimestamp) * 1000).toISOString()
          : new Date().toISOString();
        const deliveryStatus = mappedStatus ?? "sent";

        const mediaInfo = extractMediaInfo(m);
        const media = mediaInfo
          ? await persistMedia(admin, inst, ticket.id, externalId, mediaInfo, m, inst.instance_name)
          : null;

        await admin.from("messages").upsert(
          {
            company_id: inst.company_id,
            ticket_id: ticket.id,
            contact_id: contactId,
            channel_id: inst.channel_id,
            direction: "outbound",
            msg_type: msgType,
            body,
            raw_body: body,
            external_id: externalId,
            provider_message_id: externalId,
            from_me: true,
            source: "whatsapp_device",
            sent_by_user_id: null,
            sent_by_name: "WhatsApp",
            sent_by_signature: null,
            delivery_status: deliveryStatus,
            status: deliveryStatus,
            raw: m,
            sent_at: sentAt,
            media_mime_type: media?.mime ?? mediaInfo?.mime ?? null,
            media_file_name: media?.fileName ?? mediaInfo?.fileName ?? null,
            media_size: media?.size ?? mediaInfo?.size ?? null,
            media_duration: mediaInfo?.duration ?? null,
            media_caption: mediaInfo?.caption ?? null,
            media_storage_path: media?.storage_path ?? null,
            media_provider_id: mediaInfo?.providerId ?? null,
          },
          { onConflict: "channel_id,external_id" },
        );


        const ticketPatch: Record<string, unknown> = { last_message_at: sentAt };
        if (ticket.status === "closed") ticketPatch.status = "open";
        await admin.from("tickets").update(ticketPatch).eq("id", ticket.id);

        auditStatus(source, inst.instance_name ?? null, externalId, statusRaw, deliveryStatus, 1);
      }
      continue;
    }

    // ── Inbound contact + ticket + insert
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

    let { data: ticket } = await admin
      .from("tickets")
      .select("id, unread_count, status")
      .eq("company_id", inst.company_id)
      .eq("contact_id", contactId)
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
        direction: "inbound",
        msg_type: msgType,
        body,
        external_id: externalId,
        provider_message_id: externalId,
        from_me: false,
        delivery_status: "received",
        raw: m,
        sent_at: sentAt,
      },
      { onConflict: "channel_id,external_id" },
    );

    await admin
      .from("tickets")
      .update({
        last_message_at: sentAt,
        unread_count: (ticket.unread_count ?? 0) + 1,
        status: "open",
      })
      .eq("id", ticket.id);
  }
}

async function handleMessageUpdate(admin: any, inst: any, payload: any, source = "message_update") {
  const dataArr = Array.isArray(payload?.data) ? payload.data : [payload?.data].filter(Boolean);
  for (const u of dataArr) {
    const providerId: string | undefined =
      u?.keyId ?? u?.key?.id ?? u?.messageId ?? u?.id ?? u?.update?.key?.id;
    const statusRaw =
      u?.status ?? u?.update?.status ?? u?.messageStatus ?? u?.update?.messageStatus;
    await patchOutboundStatus(admin, inst, providerId ?? null, statusRaw, source);
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
      .select("id, channel_id, company_id, instance_name")
      .eq("instance_name", instanceName)
      .maybeSingle();

    if (!inst) {
      await admin.from("channel_sync_logs").insert({
        company_id: null,
        channel_id: null,
        event_type: event || "unknown",
        metadata: payload,
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
      await handleMessageUpsert(admin, inst, payload, normalized.toLowerCase());
    } else if (
      normalized === "MESSAGES_UPDATE" ||
      normalized === "MESSAGE_UPDATE" ||
      normalized === "MESSAGE_STATUS" ||
      normalized === "SEND_MESSAGE" ||
      normalized === "MESSAGES_SET"
    ) {
      await handleMessageUpdate(admin, inst, payload, normalized.toLowerCase());
    }

    await admin.from("channel_sync_logs").insert({
      company_id: inst.company_id,
      channel_id: inst.channel_id,
      event_type: event || "unknown",
      metadata: payload,
      status: "ok",
    });


    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
