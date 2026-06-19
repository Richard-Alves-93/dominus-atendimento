// Mark a WhatsApp chat/messages as read in Evolution v2.3.7
// Frontend -> this Edge Function -> Evolution API. Never call Evolution from the client.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL")!;
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function maskJid(jid: string | null | undefined): string {
  if (!jid) return "";
  const at = jid.indexOf("@");
  const local = at >= 0 ? jid.slice(0, at) : jid;
  const suffix = at >= 0 ? jid.slice(at) : "";
  if (local.length <= 4) return "***" + suffix;
  return local.slice(0, 2) + "***" + local.slice(-2) + suffix;
}

function truncateForLog(value: unknown, max = 240): string {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function isUsableOneToOneJid(jid: string | null | undefined): jid is string {
  return !!jid && jid.endsWith("@s.whatsapp.net") && !jid.includes("@g.us") && !jid.includes("broadcast");
}

function keyFromRaw(raw: any) {
  const key = raw?.key ?? raw?.data?.key ?? raw?.message?.key ?? null;
  return {
    remoteJid: typeof key?.remoteJid === "string" ? key.remoteJid : null,
    fromMe: typeof key?.fromMe === "boolean" ? key.fromMe : null,
    id: typeof key?.id === "string" ? key.id : null,
  };
}

async function evoFetch(path: string, body: unknown) {
  const url = `${EVOLUTION_API_URL.replace(/\/+$/, "")}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  return { ok: res.ok, status: res.status, json, text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const ticketId = String(body?.ticket_id ?? "");
    const companyId = String(body?.company_id ?? "");
    if (!ticketId || !companyId) {
      return new Response(JSON.stringify({ error: "ticket_id and company_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Validate user belongs to company
    const { data: cu } = await admin
      .from("company_users")
      .select("id, status")
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .eq("status", "active")
      .maybeSingle();

    // Allow master users
    const { data: prof } = await admin.from("profiles").select("is_master, global_role").eq("id", userId).maybeSingle();
    const isMaster = !!prof?.is_master || prof?.global_role === "master";
    if (!cu && !isMaster) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load ticket + contact + channel
    const { data: ticket, error: tErr } = await admin
      .from("tickets")
      .select("id, company_id, contact_id, channel_id, unread_count")
      .eq("id", ticketId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (tErr || !ticket) {
      return new Response(JSON.stringify({ error: "ticket_not_found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: channel } = await admin
      .from("channels")
      .select("id, channel_type, status, company_id")
      .eq("id", ticket.channel_id)
      .maybeSingle();
    if (!channel || channel.company_id !== companyId || channel.channel_type !== "whatsapp") {
      return new Response(JSON.stringify({ ok: true, skipped: "not_whatsapp" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: instance } = await admin
      .from("whatsapp_instances")
      .select("instance_name, status")
      .eq("channel_id", channel.id)
      .maybeSingle();
    if (!instance?.instance_name || instance.status !== "connected") {
      return new Response(JSON.stringify({ ok: true, skipped: "instance_not_connected" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: contact } = await admin
      .from("contacts")
      .select("phone_number, external_id, metadata")
      .eq("id", ticket.contact_id)
      .maybeSingle();

    // Fetch unread inbound message IDs for this ticket to mark each as read.
    const { data: unreadMsgs } = await admin
      .from("messages")
      .select("id, external_id, provider_message_id, from_me, raw, created_at")
      .eq("ticket_id", ticketId)
      .eq("company_id", companyId)
      .eq("direction", "inbound")
      .eq("from_me", false)
      .order("created_at", { ascending: false })
      .limit(50);

    const latestInboundKey = (unreadMsgs ?? [])
      .map((m: any) => keyFromRaw(m.raw))
      .find((k) => isUsableOneToOneJid(k.remoteJid));
    const metadataRemoteJid = (contact as any)?.metadata?.remote_jid ?? (contact as any)?.metadata?.remoteJid ?? null;
    const externalJid = (contact as any)?.external_id && String((contact as any).external_id).includes("@")
      ? String((contact as any).external_id)
      : null;
    const phone = (contact as any)?.phone_number ?? null;
    const phoneJid = phone ? `${String(phone).replace(/\D/g, "")}@s.whatsapp.net` : null;
    const remoteJid = isUsableOneToOneJid(latestInboundKey?.remoteJid) ? latestInboundKey.remoteJid
      : isUsableOneToOneJid(metadataRemoteJid) ? metadataRemoteJid
      : isUsableOneToOneJid(externalJid) ? externalJid
      : isUsableOneToOneJid(phoneJid) ? phoneJid
      : null;
    if (!remoteJid) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_remote_jid" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const readKeys = (unreadMsgs ?? [])
      .map((m: any) => {
        const rawKey = keyFromRaw(m.raw);
        const id = rawKey.id ?? m.provider_message_id ?? m.external_id;
        return {
          remoteJid: isUsableOneToOneJid(rawKey.remoteJid) ? rawKey.remoteJid : remoteJid,
          fromMe: rawKey.fromMe ?? false,
          id,
          internal_uuid: m.id,
        };
      })
      .filter((m: any) => m.fromMe === false && m.id && m.id !== m.internal_uuid && isUsableOneToOneJid(m.remoteJid))
      .map(({ internal_uuid: _internal_uuid, ...m }: any) => m);

    let evoStatus: number | null = null;
    let evoOk = false;
    if (readKeys.length > 0) {
      // Evolution v2.3.7: POST /chat/markMessageAsRead/{instance}  body: { readMessages: [{ remoteJid, fromMe, id }] }
      const r = await evoFetch(`/chat/markMessageAsRead/${encodeURIComponent(instance.instance_name)}`, {
        readMessages: readKeys,
      });
      evoStatus = r.status;
      evoOk = r.ok;
      console.log("[WHATSAPP_MARK_READ_RESPONSE]", {
        company_id: companyId,
        ticket_id: ticketId,
        instance_name: instance.instance_name,
        remote_jid_masked: maskJid(remoteJid),
        message_ids_count: readKeys.length,
        http_status: r.status,
        response_ok: r.ok,
        response_body_truncated: truncateForLog(r.json ?? r.text),
      });
      if (!r.ok) {
        console.error("[WHATSAPP_MARK_READ_ERROR]", {
          company_id: companyId,
          ticket_id: ticketId,
          instance_name: instance.instance_name,
          remote_jid_masked: maskJid(remoteJid),
          payload_shape: { readMessages: readKeys.map((k: any) => ({ remoteJid: maskJid(k.remoteJid), fromMe: k.fromMe, id_prefix: String(k.id).slice(0, 6), id_length: String(k.id).length })) },
          http_status: r.status,
          error_message: truncateForLog(r.json?.message ?? r.text),
          response_body_truncated: truncateForLog(r.json ?? r.text),
        });
      }
    }

    console.log("[WHATSAPP_MARK_READ_AUDIT]", {
      company_id: companyId,
      ticket_id: ticketId,
      channel_id: channel.id,
      instance_name: instance.instance_name,
      remote_jid_masked: maskJid(remoteJid),
      unread_count_before: ticket.unread_count ?? 0,
      keys_sent: readKeys.length,
      evolution_status: evoStatus,
    });

    return new Response(JSON.stringify({ ok: true, marked: readKeys.length, evolution_ok: evoOk, evolution_status: evoStatus }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[WHATSAPP_MARK_READ_ERROR] exception", { message: (e as Error).message });
    return new Response(JSON.stringify({ error: "internal_error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
