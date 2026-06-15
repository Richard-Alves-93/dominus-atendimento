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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!EVO_URL || !EVO_KEY) return json({ error: "Evolution API not configured" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const { company_id, ticket_id, text } = await req.json();
    if (!company_id || !ticket_id || !text || typeof text !== "string" || !text.trim()) {
      return json({ error: "Invalid payload" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // authz: master or member
    const { data: profile } = await admin
      .from("profiles")
      .select("is_master")
      .eq("id", userId)
      .maybeSingle();
    let allowed = profile?.is_master === true;
    if (!allowed) {
      const { data: member } = await admin
        .from("company_users")
        .select("id")
        .eq("user_id", userId)
        .eq("company_id", company_id)
        .eq("status", "active")
        .maybeSingle();
      allowed = Boolean(member);
    }
    if (!allowed) return json({ error: "Forbidden" }, 403);

    // load ticket + contact
    const { data: ticket, error: tErr } = await admin
      .from("tickets")
      .select("id, company_id, contact_id, channel_id")
      .eq("id", ticket_id)
      .eq("company_id", company_id)
      .maybeSingle();
    if (tErr || !ticket) return json({ error: "Ticket not found" }, 404);

    const { data: contact } = await admin
      .from("contacts")
      .select("id, phone_number")
      .eq("id", ticket.contact_id)
      .maybeSingle();
    if (!contact?.phone_number) return json({ error: "Contact has no phone" }, 400);

    const { data: instance } = await admin
      .from("whatsapp_instances")
      .select("instance_name, channel_id")
      .eq("company_id", company_id)
      .eq("status", "connected")
      .maybeSingle();
    if (!instance?.instance_name) return json({ error: "No connected WhatsApp instance" }, 400);

    const channelId = ticket.channel_id ?? instance.channel_id;

    // send via Evolution
    const evoRes = await fetch(`${EVO_URL.replace(/\/$/, "")}/message/sendText/${instance.instance_name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVO_KEY },
      body: JSON.stringify({ number: contact.phone_number, text }),
    });
    const evoData = await evoRes.json().catch(() => ({}));
    if (!evoRes.ok) {
      return json({ error: "Evolution send failed", detail: evoData }, 502);
    }

    const externalId =
      evoData?.key?.id ?? evoData?.messageId ?? evoData?.message?.key?.id ?? null;

    const nowIso = new Date().toISOString();
    const { data: inserted, error: insErr } = await admin
      .from("messages")
      .insert({
        company_id,
        ticket_id,
        contact_id: contact.id,
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
      .select("id")
      .single();
    if (insErr) return json({ error: "Failed to save message", detail: insErr.message }, 500);

    await admin
      .from("tickets")
      .update({ last_message_at: nowIso, status: "open" })
      .eq("id", ticket_id);

    return json({ ok: true, message_id: inserted.id, external_id: externalId });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
