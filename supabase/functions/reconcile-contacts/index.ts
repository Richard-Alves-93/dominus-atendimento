import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type Body = {
  company_id?: string;
  suspicious_name?: string;
  dry_run?: boolean;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanName(v?: string | null) {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as Body;
    const companyId = cleanName(body.company_id);
    const suspiciousName = cleanName(body.suspicious_name);
    const dryRun = body.dry_run !== false;

    if (!companyId || !suspiciousName || suspiciousName.length < 2 || suspiciousName.length > 120) {
      return json({ error: "Parâmetros inválidos." }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: profile } = await admin
      .from("profiles")
      .select("is_master, global_role")
      .eq("id", user.id)
      .maybeSingle();
    const isMaster = profile?.is_master === true || profile?.global_role === "master";

    let allowed = isMaster;
    if (!allowed) {
      const { data: membership } = await admin
        .from("company_users")
        .select("id")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .eq("status", "active")
        .in("role", ["owner", "admin"])
        .maybeSingle();
      allowed = !!membership;
    }
    if (!allowed) return json({ error: "Forbidden" }, 403);

    const { data: contacts, error: contactsError } = await admin
      .from("contacts")
      .select("id, company_id, name, metadata")
      .eq("company_id", companyId)
      .eq("name", suspiciousName)
      .limit(200);
    if (contactsError) return json({ error: contactsError.message }, 500);

    const results: Array<{ contact_id: string; old_name_present: boolean; new_name_null_or_updated: "null" | "updated" | "unchanged"; action: string; reason: string }> = [];

    for (const contact of contacts ?? []) {
      const { data: firstMessage } = await admin
        .from("messages")
        .select("from_me, source, created_at")
        .eq("company_id", companyId)
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (firstMessage?.from_me !== true) continue;

      const { data: latestInbound } = await admin
        .from("messages")
        .select("raw, created_at")
        .eq("company_id", companyId)
        .eq("contact_id", contact.id)
        .eq("from_me", false)
        .not("raw->>pushName", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const inboundName = cleanName((latestInbound?.raw as Record<string, unknown> | null)?.pushName as string | null);
      const newName = inboundName && inboundName.toLowerCase() !== suspiciousName.toLowerCase() ? inboundName : null;
      const reason = newName
        ? "first_message_from_me_later_inbound_push_name_found"
        : "first_message_from_me_no_legitimate_inbound_name";

      if (!dryRun) {
        const metadata = {
          ...((contact.metadata as Record<string, unknown> | null) ?? {}),
          contact_reconciliation: {
            at: new Date().toISOString(),
            reason,
            old_name_present: true,
            new_name_null_or_updated: newName ? "updated" : "null",
          },
        };
        delete metadata.push_name;
        delete metadata.pushName;
        delete metadata.profile_name;
        delete metadata.profileName;

        const { error: updateError } = await admin
          .from("contacts")
          .update({ name: newName, metadata, updated_at: new Date().toISOString() })
          .eq("company_id", companyId)
          .eq("id", contact.id)
          .eq("name", suspiciousName);
        if (updateError) return json({ error: updateError.message }, 500);

        await admin.from("audit_logs").insert({
          company_id: companyId,
          event_type: "contact_reconciliation",
          changed_by: user.id,
          reason,
          metadata: {
            contact_id: contact.id,
            old_name_present: true,
            new_name_null_or_updated: newName ? "updated" : "null",
            source: "reconcile-contacts",
          },
        });

        console.log("[CONTACT_RECONCILIATION_AUDIT]", {
          company_id: companyId,
          contact_id: contact.id,
          old_name_present: true,
          new_name_null_or_updated: newName ? "updated" : "null",
          reason,
        });
      }

      results.push({
        contact_id: contact.id,
        old_name_present: true,
        new_name_null_or_updated: newName ? "updated" : "null",
        action: newName ? "updated_from_latest_inbound_push_name" : "cleared_to_phone_fallback",
        reason,
      });
    }

    return json({ dry_run: dryRun, suspicious_found: results.length, results });
  } catch (e) {
    const message = (e as Error)?.message ?? String(e);
    console.error("[CONTACT_RECONCILIATION_ERROR]", { message: message.slice(0, 240) });
    return json({ error: "Não foi possível reconciliar contatos." }, 500);
  }
});