// Send media (image / video / audio / document) via Evolution API from Dominus.
// Mirrors the security model of send-whatsapp-message:
//   - validates JWT
//   - validates company membership / ticket
//   - resolves connected WhatsApp instance
//   - downloads the file from the private "message-media" bucket
//   - sends to Evolution as base64
//   - persists message row with from_me=true; webhook dedupes via external_id

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVO_URL = Deno.env.get("EVOLUTION_API_URL");
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY");

type MediaType = "image" | "video" | "audio" | "document";

const LIMITS: Record<MediaType, number> = {
  image: 10 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  video: 32 * 1024 * 1024,
  document: 25 * 1024 * 1024,
};

const ALLOWED_MIME: Record<MediaType, RegExp> = {
  image: /^image\/(jpeg|png|webp|gif)$/i,
  video: /^video\/(mp4|webm|3gpp|quicktime)$/i,
  audio: /^audio\/(ogg|mpeg|mp3|mp4|wav|webm|aac|amr|x-m4a)$/i,
  document: /^(application\/(pdf|msword|vnd\.openxmlformats-officedocument\.[a-z]+|vnd\.ms-excel|vnd\.ms-powerpoint|zip)|text\/(plain|csv))$/i,
};

const FORBIDDEN_NAME = /\.(exe|bat|cmd|sh|js|html?|php|jar|msi|scr|vbs|ps1|com|pif|reg|svg)$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function fail(step: string, message: string, extra: Record<string, unknown> = {}) {
  console.error("[SEND_MEDIA] fail", step, message, extra);
  return json({ ok: false, error: message, step, ...extra }, 200);
}
function evoBase() {
  return EVO_URL!.replace(/\/$/, "");
}

async function bytesToBase64(bytes: Uint8Array): Promise<string> {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function dispatchToEvolution(params: {
  admin: ReturnType<typeof createClient>;
  messageId: string;
  ticketId: string;
  instanceName: string;
  phone: string;
  mediaType: MediaType;
  mimeType: string;
  fileName: string;
  base64: string;
  caption: string | null;
}) {
  const { admin, messageId, ticketId, instanceName, phone, mediaType, mimeType, fileName, base64, caption } = params;
  try {
    let endpoint: string;
    let body: Record<string, unknown>;

    if (mediaType === "audio") {
      endpoint = `${evoBase()}/message/sendWhatsAppAudio/${instanceName}`;
      body = { number: phone, audio: base64 };
    } else {
      endpoint = `${evoBase()}/message/sendMedia/${instanceName}`;
      body = {
        number: phone,
        mediatype: mediaType,
        mimetype: mimeType,
        caption: caption ?? "",
        media: base64,
        fileName,
      };
    }

    const evoRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVO_KEY! },
      body: JSON.stringify(body),
    });
    const evoText = await evoRes.text();
    let evoData: any = {};
    try { evoData = JSON.parse(evoText); } catch { evoData = { raw: evoText.slice(0, 300) }; }

    if (!evoRes.ok) {
      console.error("[SEND_MEDIA] evolution_fail", evoRes.status, evoData?.message ?? evoData?.error);
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
      evoData?.key?.id ??
      evoData?.message?.key?.id ??
      evoData?.data?.key?.id ??
      evoData?.response?.key?.id ??
      evoData?.messageId ??
      evoData?.id ?? null;

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
    await admin.from("messages").update(patch).eq("id", messageId);
    await admin.from("tickets").update({ last_message_at: nowIso, status: "open" }).eq("id", ticketId);
  } catch (e) {
    console.error("[SEND_MEDIA] dispatch_exception", (e as Error)?.message);
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
  try {
    if (!EVO_URL || !EVO_KEY) return fail("config", "Evolution API não configurada");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ ok: false, error: "Missing bearer token", step: "auth" }, 401);
    const token = authHeader.slice(7).trim();

    const anonClient = createClient(SUPABASE_URL, ANON_KEY);
    let userId: string | null = null;
    try {
      const claimsRes = await (anonClient.auth as any).getClaims(token);
      if (claimsRes?.data?.claims?.sub) userId = claimsRes.data.claims.sub as string;
    } catch (_) { /* */ }
    if (!userId) {
      const { data: userData, error: userErr } = await anonClient.auth.getUser(token);
      if (userErr || !userData?.user) return json({ ok: false, error: "Invalid session", step: "auth" }, 401);
      userId = userData.user.id;
    }

    const payload = await req.json().catch(() => ({} as any));
    const company_id: string | undefined = payload.company_id;
    const ticket_id: string | undefined = payload.ticket_id;
    const media_storage_path: string | undefined = payload.media_storage_path;
    const media_type: MediaType | undefined = payload.media_type;
    const media_mime_type: string | undefined = payload.media_mime_type;
    const media_file_name: string = (payload.media_file_name ?? "arquivo").toString().slice(0, 200);
    const caption: string | null = payload.caption?.toString()?.slice(0, 1024) || null;

    if (!company_id || !ticket_id || !media_storage_path || !media_type || !media_mime_type) {
      return fail("payload", "Parâmetros obrigatórios ausentes");
    }
    if (!["image", "video", "audio", "document"].includes(media_type)) {
      return fail("media_type", "Tipo de mídia não suportado");
    }
    if (!ALLOWED_MIME[media_type].test(media_mime_type)) {
      return fail("mime", "Tipo de arquivo não permitido");
    }
    if (FORBIDDEN_NAME.test(media_file_name)) {
      return fail("filename", "Arquivo bloqueado por extensão suspeita");
    }
    if (!media_storage_path.startsWith(`${company_id}/`)) {
      return fail("path", "Caminho de mídia inválido");
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── authz ──
    const [profileRes, memberRes, ticketRes, instanceRes, senderRes] = await Promise.all([
      admin.from("profiles").select("is_master").eq("id", userId).maybeSingle(),
      admin.from("company_users").select("id").eq("user_id", userId).eq("company_id", company_id).eq("status", "active").maybeSingle(),
      admin.from("tickets").select("id, company_id, contact_id, channel_id").eq("id", ticket_id).eq("company_id", company_id).maybeSingle(),
      admin.from("whatsapp_instances").select("instance_name, channel_id, status").eq("company_id", company_id).eq("status", "connected").maybeSingle(),
      admin.from("profiles").select("full_name, public_name").eq("id", userId).maybeSingle(),
    ]);
    const allowed = profileRes.data?.is_master === true || Boolean(memberRes.data);
    if (!allowed) return fail("authz", "Forbidden");
    const ticket = ticketRes.data;
    if (!ticket) return fail("ticket", "Ticket não encontrado");
    const instance = instanceRes.data;
    if (!instance?.instance_name) return fail("instance", "Nenhuma instância WhatsApp conectada");

    const { data: contact } = await admin
      .from("contacts").select("id, phone_number").eq("id", ticket.contact_id).maybeSingle();
    const phone = contact?.phone_number?.replace(/\D/g, "") ?? "";
    if (!phone) return fail("contact", "Contato sem telefone");

    // ── download file from storage ──
    const dl = await admin.storage.from("message-media").download(media_storage_path);
    if (dl.error || !dl.data) return fail("storage_download", dl.error?.message ?? "Falha ao ler arquivo");
    const arrayBuf = await dl.data.arrayBuffer();
    const size = arrayBuf.byteLength;
    if (size <= 0) return fail("empty", "Arquivo vazio");
    if (size > LIMITS[media_type]) return fail("size", "Arquivo muito grande para envio");

    const base64 = await bytesToBase64(new Uint8Array(arrayBuf));

    const channelId = ticket.channel_id ?? instance.channel_id;
    const sp = senderRes.data;
    const senderName = sp?.public_name ?? sp?.full_name ?? null;

    // ── insert as sending ──
    const { data: inserted, error: insErr } = await admin
      .from("messages")
      .insert({
        company_id,
        ticket_id,
        contact_id: contact!.id,
        channel_id: channelId,
        direction: "outbound",
        from_me: true,
        msg_type: media_type,
        body: caption ?? "",
        raw_body: caption ?? "",
        sent_by_user_id: userId,
        sent_by_name: senderName,
        status: "sending",
        delivery_status: "sending",
        media_mime_type,
        media_file_name,
        media_size: size,
        media_caption: caption,
        media_storage_path,
      })
      .select("id").single();
    if (insErr) return fail("db_insert", "Falha ao salvar mensagem", { detail: insErr.message });

    admin.from("tickets")
      .update({ last_message_at: new Date().toISOString(), status: "open" })
      .eq("id", ticket_id)
      .then(() => {}, (e: any) => console.error("[SEND_MEDIA] ticket bump failed", e?.message));

    const bg = dispatchToEvolution({
      admin, messageId: inserted.id, ticketId: ticket_id,
      instanceName: instance.instance_name, phone,
      mediaType: media_type, mimeType: media_mime_type, fileName: media_file_name,
      base64, caption,
    });
    try { (globalThis as any).EdgeRuntime?.waitUntil?.(bg); } catch (_) {}

    return json({ ok: true, message_id: inserted.id, delivery_status: "sending" });
  } catch (e) {
    return fail("exception", String((e as Error)?.message ?? e));
  }
});
