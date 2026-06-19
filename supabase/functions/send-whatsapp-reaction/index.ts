import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVO_URL = Deno.env.get("EVOLUTION_API_URL");
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function fail(step: string, message: string, extra: Record<string, unknown> = {}, status = 200) {
  console.error("[SEND_REACTION] fail", step, message, extra);
  return json({ ok: false, error: message, step, ...extra }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!EVO_URL || !EVO_KEY) return fail("config", "Evolution API not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ ok: false, error: "Missing bearer token", step: "auth" }, 401);
    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) return json({ ok: false, error: "Missing bearer token", step: "auth" }, 401);

    const anonClient = createClient(SUPABASE_URL, ANON_KEY);
    let userId: string | null = null;
    try {
      const c = await (anonClient.auth as any).getClaims(token);
      if (c?.data?.claims?.sub) userId = c.data.claims.sub as string;
    } catch (_) {}
    if (!userId) {
      const { data, error } = await anonClient.auth.getUser(token);
      if (error || !data?.user) return json({ ok: false, error: "Invalid session", step: "auth" }, 401);
      userId = data.user.id;
    }

    const payload = await req.json().catch(() => ({} as any));
    const { company_id, ticket_id, message_id, emoji } = payload ?? {};
    if (!company_id || !ticket_id || !message_id || typeof emoji !== "string") {
      return fail("payload", "Invalid payload (company_id, ticket_id, message_id, emoji required)");
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const [profileRes, memberRes, msgRes, instanceRes] = await Promise.all([
      admin.from("profiles").select("is_master").eq("id", userId).maybeSingle(),
      admin.from("company_users").select("id")
        .eq("user_id", userId).eq("company_id", company_id).eq("status", "active").maybeSingle(),
      admin.from("messages")
        .select("id, ticket_id, company_id, from_me, provider_message_id, external_id, raw, contact_id")
        .eq("id", message_id).eq("company_id", company_id).maybeSingle(),
      admin.from("whatsapp_instances")
        .select("instance_name, status").eq("company_id", company_id).eq("status", "connected").maybeSingle(),
    ]);

    const allowed = profileRes.data?.is_master === true || Boolean(memberRes.data);
    if (!allowed) return fail("authz", "Forbidden");

    const msg = msgRes.data as any;
    if (!msg || msg.ticket_id !== ticket_id) return fail("message", "Message not found");

    const instance = instanceRes.data;
    if (!instance?.instance_name) return fail("instance", "No connected WhatsApp instance");

    const { data: contact } = await admin.from("contacts").select("phone_number").eq("id", msg.contact_id).maybeSingle();
    const phone = contact?.phone_number?.replace(/\D/g, "") ?? "";
    const remoteJid: string | undefined =
      msg.raw?.key?.remoteJid ?? (phone ? `${phone}@s.whatsapp.net` : undefined);
    const waId: string | undefined =
      msg.raw?.key?.id ?? msg.provider_message_id ?? msg.external_id ?? undefined;
    const fromMe: boolean = msg.raw?.key?.fromMe ?? !!msg.from_me;

    if (!remoteJid || !waId) {
      return fail("wa_key", "Message missing WhatsApp key (remoteJid/id)");
    }

    const endpoint = `${EVO_URL.replace(/\/$/, "")}/message/sendReaction/${instance.instance_name}`;
    const body = {
      key: { remoteJid, fromMe, id: waId },
      reaction: emoji ?? "",
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVO_KEY! },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }

    if (!res.ok) {
      const nested = data?.response?.message ?? data?.message ?? data?.error ?? text;
      const detail = (typeof nested === "string" ? nested : JSON.stringify(nested)).slice(0, 300);
      console.error("[SEND_REACTION] evolution_fail", res.status, detail);
      return json({ ok: false, error: `evolution_${res.status}: ${detail}`, step: "evolution" });
    }

    console.log("[SEND_REACTION] ok", { message_id, emoji: emoji || "(remove)" });
    return json({ ok: true, removed: emoji === "" });
  } catch (e) {
    return fail("exception", String((e as Error)?.message ?? e));
  }
});
