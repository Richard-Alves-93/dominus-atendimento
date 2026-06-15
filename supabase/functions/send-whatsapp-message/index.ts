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
// fail = HTTP 200 with error payload, so frontend can read it
function fail(step: string, message: string, extra: Record<string, unknown> = {}) {
  console.error("[SEND_WA] fail", step, message, extra);
  return json({ ok: false, error: message, step, ...extra }, 200);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    console.log("[SEND_WA] start");
    if (!EVO_URL || !EVO_KEY) return fail("config", "Evolution API not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return fail("auth", "Missing bearer token");

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return fail("auth", "Invalid session", { detail: userErr?.message });
    const userId = userData.user.id;
    console.log("[SEND_WA] user_id:", userId);

    const payload = await req.json().catch(() => ({} as any));
    const company_id = payload.company_id;
    const ticket_id = payload.ticket_id;
    const text: string | undefined = payload.text ?? payload.body ?? payload.message;
    console.log("[SEND_WA] payload:", { company_id, ticket_id, has_text: Boolean(text) });

    if (!company_id || !ticket_id || !text?.trim()) {
      return fail("payload", "Invalid payload (company_id, ticket_id, text required)");
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // authz
    const { data: profile } = await admin
      .from("profiles").select("is_master").eq("id", userId).maybeSingle();
    let allowed = profile?.is_master === true;
    if (!allowed) {
      const { data: member } = await admin
        .from("company_users").select("id")
        .eq("user_id", userId).eq("company_id", company_id).eq("status", "active")
        .maybeSingle();
      allowed = Boolean(member);
    }
    if (!allowed) return fail("authz", "Forbidden");

    const { data: ticket, error: tErr } = await admin
      .from("tickets")
      .select("id, company_id, contact_id, channel_id")
      .eq("id", ticket_id).eq("company_id", company_id).maybeSingle();
    if (tErr || !ticket) return fail("ticket", "Ticket not found", { detail: tErr?.message });
    console.log("[SEND_WA] ticket:", ticket.id);

    const { data: contact } = await admin
      .from("contacts").select("id, phone_number").eq("id", ticket.contact_id).maybeSingle();
    const phone = contact?.phone_number?.replace(/\D/g, "") ?? "";
    console.log("[SEND_WA] contact phone len:", phone.length);
    if (!phone) return fail("contact", "Contact has no phone");

    const { data: instance } = await admin
      .from("whatsapp_instances")
      .select("instance_name, channel_id, status")
      .eq("company_id", company_id).eq("status", "connected").maybeSingle();
    console.log("[SEND_WA] instance:", instance?.instance_name, instance?.status);
    if (!instance?.instance_name) return fail("instance", "No connected WhatsApp instance");

    const channelId = ticket.channel_id ?? instance.channel_id;
    const endpoint = `${EVO_URL.replace(/\/$/, "")}/message/sendText/${instance.instance_name}`;
    console.log("[SEND_WA] endpoint:", endpoint);

    // Load sender profile for signature
    const { data: senderProfile } = await admin
      .from("profiles")
      .select("full_name, public_name, signature, signature_enabled")
      .eq("id", userId).maybeSingle();
    const senderName = senderProfile?.public_name ?? senderProfile?.full_name ?? null;
    const signatureLine = senderProfile?.signature_enabled && senderProfile?.signature
      ? senderProfile.signature.trim()
      : null;
    const finalText = signatureLine ? `${signatureLine}:\n${text}` : text;

    const evoRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVO_KEY },
      body: JSON.stringify({ number: phone, text: finalText }),
    });
    const evoText = await evoRes.text();
    let evoData: any = {};
    try { evoData = JSON.parse(evoText); } catch { evoData = { raw: evoText.slice(0, 300) }; }
    console.log("[SEND_WA] evolution status:", evoRes.status);

    if (!evoRes.ok) {
      return fail("evolution_send", `Evolution ${evoRes.status}`, {
        status: evoRes.status,
        detail: evoData?.message ?? evoData?.error ?? evoData?.raw ?? "unknown",
      });
    }

    const externalId =
      evoData?.key?.id ?? evoData?.messageId ?? evoData?.message?.key?.id ?? null;

    const nowIso = new Date().toISOString();
    const { data: inserted, error: insErr } = await admin
      .from("messages")
      .insert({
        company_id, ticket_id,
        contact_id: contact!.id,
        channel_id: channelId,
        direction: "outbound",
        from_me: true,
        msg_type: "text",
        body: text,
        external_id: externalId,
        status: "sent",
        sent_at: nowIso,
        raw: evoData,
      })
      .select("id").single();
    if (insErr) return fail("db_insert", "Failed to save message", { detail: insErr.message });

    await admin.from("tickets")
      .update({ last_message_at: nowIso, status: "open" })
      .eq("id", ticket_id);

    return json({ ok: true, message_id: inserted.id, external_id: externalId });
  } catch (e) {
    return fail("exception", String((e as Error)?.message ?? e));
  }
});
