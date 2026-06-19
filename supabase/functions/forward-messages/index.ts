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

type WaKey = { remoteJid: string; fromMe: boolean; id: string; participant?: string };
type NativeForwardResult = {
  attempted: boolean;
  ok: boolean;
  confirmed: boolean;
  status: number | null;
  data: any;
  endpointUsed: string | null;
  payloadShape: string;
  fallbackReason: string | null;
  key?: WaKey;
  keySource?: string;
};

function maskPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 6) return "***";
  return `${digits.slice(0, 4)}***${digits.slice(-2)}`;
}
function maskJid(value: string | null | undefined): string | null {
  if (!value) return null;
  const at = value.indexOf("@");
  const local = at >= 0 ? value.slice(0, at) : value;
  const suffix = at >= 0 ? value.slice(at) : "";
  if (local.length <= 6) return `***${suffix}`;
  return `${local.slice(0, 4)}***${local.slice(-2)}${suffix}`;
}
function truncateForLog(value: unknown, max = 500): string | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
function keyFromCandidate(candidate: any, fallbackRemoteJid: string | null, fallbackFromMe: boolean, fallbackId: string | null): WaKey | null {
  const id = typeof candidate?.id === "string" && candidate.id.trim() ? candidate.id : fallbackId;
  const remoteJid = typeof candidate?.remoteJid === "string" && candidate.remoteJid.trim() ? candidate.remoteJid : fallbackRemoteJid;
  if (!id || !remoteJid) return null;
  const key: WaKey = {
    remoteJid,
    fromMe: typeof candidate?.fromMe === "boolean" ? candidate.fromMe : fallbackFromMe,
    id,
  };
  if (typeof candidate?.participant === "string" && candidate.participant.trim()) key.participant = candidate.participant;
  return key;
}
function resolveOriginalMessage(src: any): { key: WaKey | null; keySource: string | null; message: any | null } {
  const raw = src.raw ?? {};
  const rawPayload = src.raw_payload ?? raw?.raw_payload ?? raw?.rawPayload ?? raw?.payload ?? null;
  const fallbackId = src.provider_message_id ?? src.external_id ?? null;
  const fallbackRemoteJid = typeof raw?.key?.remoteJid === "string"
    ? raw.key.remoteJid
    : typeof rawPayload?.key?.remoteJid === "string"
      ? rawPayload.key.remoteJid
      : null;
  const fallbackFromMe = typeof raw?.key?.fromMe === "boolean" ? raw.key.fromMe : Boolean(src.from_me);
  const candidates: Array<[string, any]> = [
    ["raw_payload.key", rawPayload?.key],
    ["raw.key", raw?.key],
    ["raw.data.key", raw?.data?.key],
    ["raw.message.key", raw?.message?.key],
    ["raw.message.message.key", raw?.message?.message?.key],
  ];
  for (const [source, candidate] of candidates) {
    const key = keyFromCandidate(candidate, fallbackRemoteJid, fallbackFromMe, fallbackId);
    if (key) {
      const payload = source.startsWith("raw_payload") ? rawPayload : raw;
      return { key, keySource: source, message: payload?.message ?? payload?.data?.message ?? null };
    }
  }
  return { key: null, keySource: null, message: raw?.message ?? rawPayload?.message ?? null };
}
function hasNativeForwardMarker(value: any, depth = 0): boolean {
  if (!value || depth > 8) return false;
  if (Array.isArray(value)) return value.some((item) => hasNativeForwardMarker(item, depth + 1));
  if (typeof value !== "object") return false;
  if (value.isForwarded === true) return true;
  if (Number(value.forwardingScore ?? value.forwarding_score ?? 0) > 0) return true;
  if (value.forward && typeof value.forward === "object") return true;
  return Object.values(value).some((item) => hasNativeForwardMarker(item, depth + 1));
}
function summarizeEvoResponse(data: any) {
  const message = data?.message ?? data?.data?.message ?? data?.response?.message ?? null;
  return {
    externalId: extractExternalId(data),
    topLevelKeys: data && typeof data === "object" ? Object.keys(data).slice(0, 12) : [],
    messageKeys: message && typeof message === "object" ? Object.keys(message).slice(0, 12) : [],
    hasForwardMarker: hasNativeForwardMarker(data),
    error: truncateForLog(data?.error ?? (typeof message === "string" ? message : null)),
  };
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
      .select("id, company_id, ticket_id, msg_type, body, from_me, external_id, provider_message_id, raw, media_storage_path, media_mime_type, media_file_name, media_caption")
      .in("id", message_ids)
      .eq("company_id", company_id);

    if (srcErr) return fail("src_fetch", srcErr.message);
    if (!srcRows || srcRows.length === 0) return fail("src_empty", "Nenhuma mensagem encontrada");

    // Resolve source ticket → contact phone (remoteJid) for native forward payload
    const srcTicketIds = Array.from(new Set(srcRows.map((r: any) => r.ticket_id).filter(Boolean)));
    const srcTicketPhone = new Map<string, string>();
    if (srcTicketIds.length > 0) {
      const { data: srcTickets } = await admin
        .from("tickets")
        .select("id, contact:contacts(phone_number)")
        .in("id", srcTicketIds)
        .eq("company_id", company_id);
      for (const t of (srcTickets ?? []) as any[]) {
        const p = (t.contact?.phone_number ?? "").replace(/\D/g, "");
        if (p) srcTicketPhone.set(t.id, p);
      }
    }

    // Preserve original order from message_ids array
    const byId = new Map(srcRows.map((r: any) => [r.id, r]));
    const orderedSources = message_ids
      .map((id) => byId.get(id))
      .filter((r): r is any => !!r);

    const results: Array<{ source_id: string; ok: boolean; message_id?: string; error?: string; mode?: string }> = [];
    const nowIso = () => new Date().toISOString();

    // Try Evolution native forward endpoint. Returns { ok, status, data } or null when unsupported/no key.
    async function tryNativeForward(src: any): Promise<{ ok: boolean; status: number; data: any } | null> {
      const extId = src.external_id ?? src.provider_message_id ?? null;
      const srcPhone = srcTicketPhone.get(src.ticket_id);
      if (!extId || !srcPhone) return null;
      const remoteJid = `${srcPhone}@s.whatsapp.net`;
      const key = { remoteJid, fromMe: Boolean(src.from_me), id: extId };
      const endpoint = `${evoBase()}/message/forwardMessage/${instance.instance_name}`;
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: EVO_KEY! },
          body: JSON.stringify({ number: phone, message: { key } }),
        });
        const txt = await res.text();
        let data: any = {};
        try { data = JSON.parse(txt); } catch { data = { raw: txt.slice(0, 300) }; }
        // Treat 404 / "not found" as "endpoint unsupported" → caller falls back
        if (res.status === 404) return null;
        return { ok: res.ok, status: res.status, data };
      } catch (_e) {
        return null;
      }
    }

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

          // 1) try native forward (preserves "Forwarded" tag on WhatsApp)
          const nativeRes = await tryNativeForward(src);
          let evoRes: Response | null = null;
          let evoData: any = null;
          let mode: "native" | "fallback" = "fallback";

          if (nativeRes && nativeRes.ok) {
            evoData = nativeRes.data;
            mode = "native";
          } else {
            const endpoint = `${evoBase()}/message/sendText/${instance.instance_name}`;
            evoRes = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: EVO_KEY! },
              body: JSON.stringify({ number: phone, text }),
            });
            const evoText = await evoRes.text();
            try { evoData = JSON.parse(evoText); } catch { evoData = { raw: evoText.slice(0, 300) }; }
          }

          const status = mode === "native" ? 200 : (evoRes?.status ?? 0);
          if (mode === "fallback" && !(evoRes && evoRes.ok)) {
            await admin.from("messages").update({
              delivery_status: "failed",
              status: "failed",
              failed_at: nowIso(),
              failure_reason: `evolution_${status}`,
              raw: { ...forwardedMeta, evo: evoData, forward_mode: mode },
            }).eq("id", inserted.id);
            results.push({ source_id: src.id, ok: false, error: `evolution_${status}`, mode });
            continue;
          }
          const externalId = extractExternalId(evoData);
          const patch: Record<string, unknown> = {
            delivery_status: "sent",
            status: "sent",
            sent_at: nowIso(),
            raw: { ...forwardedMeta, evo: evoData, forward_mode: mode },
          };
          if (externalId) {
            patch.external_id = externalId;
            patch.provider_message_id = externalId;
          }
          await admin.from("messages").update(patch).eq("id", inserted.id);
          results.push({ source_id: src.id, ok: true, message_id: inserted.id, mode });
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

          // 1) try native forward (preserves "Forwarded" tag on WhatsApp)
          const nativeRes = await tryNativeForward(src);
          let evoRes: Response | null = null;
          let evoData: any = null;
          let mode: "native" | "fallback" = "fallback";

          if (nativeRes && nativeRes.ok) {
            evoData = nativeRes.data;
            mode = "native";
          } else {
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
            evoRes = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: EVO_KEY! },
              body: JSON.stringify(body),
            });
            const evoText = await evoRes.text();
            try { evoData = JSON.parse(evoText); } catch { evoData = { raw: evoText.slice(0, 300) }; }
          }

          const status = mode === "native" ? 200 : (evoRes?.status ?? 0);
          if (mode === "fallback" && !(evoRes && evoRes.ok)) {
            await admin.from("messages").update({
              delivery_status: "failed",
              status: "failed",
              failed_at: nowIso(),
              failure_reason: `evolution_${status}`,
              raw: { ...forwardedMeta, evo: evoData, forward_mode: mode },
            }).eq("id", inserted.id);
            results.push({ source_id: src.id, ok: false, error: `evolution_${status}`, mode });
            continue;
          }
          const externalId = extractExternalId(evoData);
          const patch: Record<string, unknown> = {
            delivery_status: "sent",
            status: "sent",
            sent_at: nowIso(),
            raw: { ...forwardedMeta, evo: evoData, forward_mode: mode },
          };
          if (externalId) {
            patch.external_id = externalId;
            patch.provider_message_id = externalId;
          }
          await admin.from("messages").update(patch).eq("id", inserted.id);
          results.push({ source_id: src.id, ok: true, message_id: inserted.id, mode });
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
