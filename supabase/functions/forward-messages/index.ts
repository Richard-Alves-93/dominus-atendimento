// Forward one or more existing messages to another ticket of the SAME company.
// Front-end NEVER calls Evolution directly — this function brokers the send and
// records the new messages with forwarded metadata in messages.raw.
//
// Security model mirrors send-whatsapp-message / send-whatsapp-media:
//   - JWT validated (signing-keys)
//   - company_id validated against profiles.is_master OR active company_users
//   - source messages must belong to the same company_id
//   - target ticket must belong to the same company_id
//   - Evolution credentials live ONLY in this function

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVO_URL = Deno.env.get("EVOLUTION_API_URL");
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY");

const MEDIA_TYPES = ["image", "video", "audio", "document"] as const;
type MediaType = typeof MEDIA_TYPES[number];

const MEDIA_LIMITS: Record<MediaType, number> = {
  image: 10 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  video: 32 * 1024 * 1024,
  document: 25 * 1024 * 1024,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function fail(step: string, message: string, extra: Record<string, unknown> = {}) {
  console.error("[FORWARD] fail", step, message, extra);
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

function extractExternalId(evoData: any): string | null {
  return (
    evoData?.key?.id ??
    evoData?.message?.key?.id ??
    evoData?.data?.key?.id ??
    evoData?.response?.key?.id ??
    evoData?.messageId ??
    evoData?.id ??
    null
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!EVO_URL || !EVO_KEY) return fail("config", "Evolution API not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ ok: false, error: "Missing bearer token", step: "auth" }, 401);
    }
    const token = authHeader.slice(7).trim();

    const anon = createClient(SUPABASE_URL, ANON_KEY);
    let userId: string | null = null;
    try {
      const claimsRes = await (anon.auth as any).getClaims(token);
      if (claimsRes?.data?.claims?.sub) userId = claimsRes.data.claims.sub as string;
    } catch (_) { /* fallthrough */ }
    if (!userId) {
      const { data: userData, error: userErr } = await anon.auth.getUser(token);
      if (userErr || !userData?.user) {
        return json({ ok: false, error: "Invalid session", step: "auth" }, 401);
      }
      userId = userData.user.id;
    }

    const payload = await req.json().catch(() => ({} as any));
    const company_id: string | undefined = payload.company_id;
    const target_ticket_id: string | undefined = payload.target_ticket_id;
    const message_ids: string[] = Array.isArray(payload.message_ids) ? payload.message_ids : [];

    if (!company_id || !target_ticket_id || message_ids.length === 0) {
      return fail("payload", "company_id, target_ticket_id and message_ids required");
    }
    if (message_ids.length > 20) {
      return fail("payload", "Máximo de 20 mensagens por encaminhamento");
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── authz: master OR active company member ──
    const [profileRes, memberRes, targetTicketRes, instanceRes, senderRes] = await Promise.all([
      admin.from("profiles").select("is_master, full_name, public_name").eq("id", userId).maybeSingle(),
      admin.from("company_users").select("id").eq("user_id", userId).eq("company_id", company_id).eq("status", "active").maybeSingle(),
      admin.from("tickets").select("id, company_id, contact_id, channel_id").eq("id", target_ticket_id).eq("company_id", company_id).maybeSingle(),
      admin.from("whatsapp_instances").select("instance_name, channel_id, status").eq("company_id", company_id).eq("status", "connected").maybeSingle(),
      admin.from("profiles").select("full_name, public_name").eq("id", userId).maybeSingle(),
    ]);

    const allowed = profileRes.data?.is_master === true || Boolean(memberRes.data);
    if (!allowed) return fail("authz", "Forbidden");

    const targetTicket: any = targetTicketRes.data;
    if (!targetTicket) return fail("target_ticket", "Ticket de destino não encontrado");

    const instance: any = instanceRes.data;
    if (!instance?.instance_name) return fail("instance", "Nenhuma instância WhatsApp conectada");

    const { data: contact } = await admin
      .from("contacts").select("id, phone_number").eq("id", targetTicket.contact_id).maybeSingle();
    const phone = (contact as any)?.phone_number?.replace(/\D/g, "") ?? "";
    if (!phone) return fail("contact", "Contato de destino sem telefone");

    const channelId = targetTicket.channel_id ?? instance.channel_id;
    const sp: any = senderRes.data;
    const senderName = sp?.public_name ?? sp?.full_name ?? null;

    // ── fetch source messages (filter by company_id explicitly) ──
    const { data: srcRows, error: srcErr } = await admin
      .from("messages")
      .select("id, company_id, ticket_id, msg_type, body, media_storage_path, media_mime_type, media_file_name, media_caption")
      .in("id", message_ids)
      .eq("company_id", company_id);

    if (srcErr) return fail("src_fetch", srcErr.message);
    if (!srcRows || srcRows.length === 0) return fail("src_empty", "Nenhuma mensagem encontrada");

    // Preserve original order from message_ids array
    const byId = new Map(srcRows.map((r: any) => [r.id, r]));
    const orderedSources = message_ids
      .map((id) => byId.get(id))
      .filter((r): r is any => !!r);

    const results: Array<{ source_id: string; ok: boolean; message_id?: string; error?: string }> = [];
    const nowIso = () => new Date().toISOString();

    for (const src of orderedSources) {
      const forwardedMeta = {
        forwarded: true,
        forwarded_from_message_id: src.id,
        forwarded_from_ticket_id: src.ticket_id,
        forwarded_by: userId,
        forwarded_at: nowIso(),
      };

      const isMedia = MEDIA_TYPES.includes(src.msg_type as MediaType);
      try {
        if (!isMedia) {
          // ── text forward ──
          const text = (src.body ?? "").toString();
          if (!text.trim()) {
            results.push({ source_id: src.id, ok: false, error: "Mensagem de texto vazia" });
            continue;
          }
          const { data: inserted, error: insErr } = await admin
            .from("messages")
            .insert({
              company_id,
              ticket_id: target_ticket_id,
              contact_id: contact!.id,
              channel_id: channelId,
              direction: "outbound",
              from_me: true,
              msg_type: "text",
              body: text,
              raw_body: text,
              sent_by_user_id: userId,
              sent_by_name: senderName,
              status: "sending",
              delivery_status: "sending",
              raw: forwardedMeta,
            })
            .select("id").single();
          if (insErr) throw new Error(insErr.message);

          const endpoint = `${evoBase()}/message/sendText/${instance.instance_name}`;
          const evoRes = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: EVO_KEY! },
            body: JSON.stringify({ number: phone, text }),
          });
          const evoText = await evoRes.text();
          let evoData: any = {};
          try { evoData = JSON.parse(evoText); } catch { evoData = { raw: evoText.slice(0, 300) }; }

          if (!evoRes.ok) {
            await admin.from("messages").update({
              delivery_status: "failed",
              status: "failed",
              failed_at: nowIso(),
              failure_reason: `evolution_${evoRes.status}`,
              raw: { ...forwardedMeta, evo: evoData },
            }).eq("id", inserted.id);
            results.push({ source_id: src.id, ok: false, error: `evolution_${evoRes.status}` });
            continue;
          }
          const externalId = extractExternalId(evoData);
          const patch: Record<string, unknown> = {
            delivery_status: "sent",
            status: "sent",
            sent_at: nowIso(),
            raw: { ...forwardedMeta, evo: evoData },
          };
          if (externalId) {
            patch.external_id = externalId;
            patch.provider_message_id = externalId;
          }
          await admin.from("messages").update(patch).eq("id", inserted.id);
          results.push({ source_id: src.id, ok: true, message_id: inserted.id });
        } else {
          // ── media forward ──
          const mediaType = src.msg_type as MediaType;
          const path = src.media_storage_path as string | null;
          const mime = src.media_mime_type as string | null;
          if (!path || !mime) {
            results.push({ source_id: src.id, ok: false, error: "Mídia sem caminho/mime" });
            continue;
          }
          // path must start with company_id/
          if (!path.startsWith(`${company_id}/`)) {
            results.push({ source_id: src.id, ok: false, error: "Caminho de mídia inválido" });
            continue;
          }
          const dl = await admin.storage.from("message-media").download(path);
          if (dl.error || !dl.data) {
            results.push({ source_id: src.id, ok: false, error: dl.error?.message ?? "Falha ao baixar mídia" });
            continue;
          }
          const buf = await dl.data.arrayBuffer();
          if (buf.byteLength <= 0 || buf.byteLength > MEDIA_LIMITS[mediaType]) {
            results.push({ source_id: src.id, ok: false, error: "Mídia inválida ou muito grande" });
            continue;
          }
          const base64 = await bytesToBase64(new Uint8Array(buf));
          const fileName = (src.media_file_name as string | null) ?? "arquivo";
          const caption = (src.media_caption as string | null) ?? null;

          const { data: inserted, error: insErr } = await admin
            .from("messages")
            .insert({
              company_id,
              ticket_id: target_ticket_id,
              contact_id: contact!.id,
              channel_id: channelId,
              direction: "outbound",
              from_me: true,
              msg_type: mediaType,
              body: caption ?? "",
              raw_body: caption ?? "",
              sent_by_user_id: userId,
              sent_by_name: senderName,
              status: "sending",
              delivery_status: "sending",
              media_mime_type: mime,
              media_file_name: fileName,
              media_size: buf.byteLength,
              media_caption: caption,
              media_storage_path: path,
              raw: forwardedMeta,
            })
            .select("id").single();
          if (insErr) throw new Error(insErr.message);

          let endpoint: string;
          let body: Record<string, unknown>;
          if (mediaType === "audio") {
            endpoint = `${evoBase()}/message/sendWhatsAppAudio/${instance.instance_name}`;
            body = { number: phone, audio: base64 };
          } else {
            endpoint = `${evoBase()}/message/sendMedia/${instance.instance_name}`;
            body = {
              number: phone,
              mediatype: mediaType,
              mimetype: mime,
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
            await admin.from("messages").update({
              delivery_status: "failed",
              status: "failed",
              failed_at: nowIso(),
              failure_reason: `evolution_${evoRes.status}`,
              raw: { ...forwardedMeta, evo: evoData },
            }).eq("id", inserted.id);
            results.push({ source_id: src.id, ok: false, error: `evolution_${evoRes.status}` });
            continue;
          }
          const externalId = extractExternalId(evoData);
          const patch: Record<string, unknown> = {
            delivery_status: "sent",
            status: "sent",
            sent_at: nowIso(),
            raw: { ...forwardedMeta, evo: evoData },
          };
          if (externalId) {
            patch.external_id = externalId;
            patch.provider_message_id = externalId;
          }
          await admin.from("messages").update(patch).eq("id", inserted.id);
          results.push({ source_id: src.id, ok: true, message_id: inserted.id });
        }
      } catch (e) {
        results.push({ source_id: src.id, ok: false, error: String((e as Error)?.message ?? e).slice(0, 200) });
      }
    }

    // bump target ticket
    await admin.from("tickets").update({ last_message_at: nowIso(), status: "open" }).eq("id", target_ticket_id);

    const sentCount = results.filter((r) => r.ok).length;
    const failedCount = results.length - sentCount;
    return json({ ok: failedCount === 0, sent: sentCount, failed: failedCount, results });
  } catch (e) {
    return fail("exception", String((e as Error)?.message ?? e));
  }
});
