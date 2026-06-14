import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface Body {
  action: "create_or_connect" | "status" | "disconnect";
  company_id: string;
  channel_id?: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const EVO_URL = Deno.env.get("EVOLUTION_API_URL");
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY");
const EVO_WEBHOOK = Deno.env.get("EVOLUTION_WEBHOOK_URL");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function instanceNameFor(companyId: string) {
  return `dominus_${companyId.replace(/-/g, "").slice(0, 8)}`;
}

async function evoCreateInstance(instanceName: string) {
  if (!EVO_URL || !EVO_KEY) {
    // Mock mode — return fake QR so the UI flow can be tested before Evolution is configured.
    return {
      qr_code:
        "data:image/svg+xml;utf8," +
        encodeURIComponent(
          `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><rect width='100%' height='100%' fill='#fff'/><text x='50%' y='50%' text-anchor='middle' dominant-baseline='middle' font-family='monospace' font-size='12' fill='#111'>QR MOCK ${instanceName}</text></svg>`,
        ),
      status: "pending" as const,
      mock: true,
    };
  }
  const res = await fetch(`${EVO_URL.replace(/\/$/, "")}/instance/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: EVO_KEY },
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      webhook: EVO_WEBHOOK,
    }),
  });
  const data = await res.json();
  return {
    qr_code: data?.qrcode?.base64 ?? data?.qrcode ?? null,
    status: "pending" as const,
    mock: false,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json()) as Body;
    if (!body?.company_id) return json({ error: "company_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Authorization: master OR member of company
    const { data: profile } = await admin
      .from("profiles")
      .select("is_master, global_role")
      .eq("id", user.id)
      .maybeSingle();
    const isMaster = profile?.is_master === true || profile?.global_role === "master";

    if (!isMaster) {
      const { data: membership } = await admin
        .from("company_users")
        .select("id")
        .eq("user_id", user.id)
        .eq("company_id", body.company_id)
        .eq("status", "active")
        .maybeSingle();
      if (!membership) return json({ error: "Forbidden" }, 403);
    }

    // Find or create the WhatsApp channel for this company
    let channelId = body.channel_id;
    let channel;
    if (channelId) {
      const { data } = await admin.from("channels").select("*").eq("id", channelId).maybeSingle();
      channel = data;
    } else {
      const { data } = await admin
        .from("channels")
        .select("*")
        .eq("company_id", body.company_id)
        .eq("channel_type", "whatsapp")
        .maybeSingle();
      channel = data;
    }

    if (body.action === "create_or_connect") {
      const instance_name = instanceNameFor(body.company_id);

      if (!channel) {
        const { data: created, error } = await admin
          .from("channels")
          .insert({
            company_id: body.company_id,
            channel_type: "whatsapp",
            channel_provider: "evolution",
            name: "WhatsApp",
            status: "pending",
          })
          .select()
          .single();
        if (error) return json({ error: error.message }, 500);
        channel = created;
      } else {
        await admin.from("channels").update({ status: "pending" }).eq("id", channel.id);
      }

      const evo = await evoCreateInstance(instance_name);

      const { data: existingInst } = await admin
        .from("whatsapp_instances")
        .select("id")
        .eq("channel_id", channel.id)
        .maybeSingle();

      if (existingInst) {
        await admin
          .from("whatsapp_instances")
          .update({ status: "pending", qr_code: evo.qr_code, instance_name })
          .eq("id", existingInst.id);
      } else {
        await admin.from("whatsapp_instances").insert({
          company_id: body.company_id,
          channel_id: channel.id,
          instance_name,
          status: "pending",
          qr_code: evo.qr_code,
        });
      }

      return json({
        status: "pending",
        qr_code: evo.qr_code,
        instance_name,
        channel_id: channel.id,
        mock: evo.mock,
      });
    }

    if (body.action === "status") {
      if (!channel) return json({ status: "disconnected" });
      const { data: inst } = await admin
        .from("whatsapp_instances")
        .select("status, qr_code, instance_name, phone_number")
        .eq("channel_id", channel.id)
        .maybeSingle();
      return json({
        status: inst?.status ?? channel.status ?? "disconnected",
        qr_code: inst?.qr_code ?? null,
        instance_name: inst?.instance_name ?? null,
        phone_number: inst?.phone_number ?? null,
        channel_id: channel.id,
      });
    }

    if (body.action === "disconnect") {
      if (channel) {
        await admin.from("channels").update({ status: "disconnected" }).eq("id", channel.id);
        await admin
          .from("whatsapp_instances")
          .update({ status: "disconnected", qr_code: null, disconnected_at: new Date().toISOString() })
          .eq("channel_id", channel.id);
      }
      return json({ status: "disconnected" });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
