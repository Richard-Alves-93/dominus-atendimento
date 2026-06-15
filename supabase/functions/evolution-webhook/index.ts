import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
      .select("id, channel_id, company_id")
      .eq("instance_name", instanceName)
      .maybeSingle();

    if (!inst) {
      await admin.from("channel_sync_logs").insert({
        company_id: null,
        channel_id: null,
        event_type: event || "unknown",
        payload,
        status: "ignored",
      }).select();
      return json({ ok: true, skipped: "unknown instance" });
    }

    const normalized = event.toUpperCase().replace(/\./g, "_");

    if (normalized === "QRCODE_UPDATED") {
      const qr = ensureDataUrl(payload?.data?.qrcode?.base64 ?? payload?.data?.qrcode ?? payload?.qrcode?.base64);
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
      if (status === "connected") {
        update.qr_code = null;
        update.connected_at = new Date().toISOString();
        const phone = payload?.data?.wuid ?? payload?.data?.number ?? null;
        if (phone) update.phone_number = String(phone).split("@")[0];
      } else if (status === "disconnected") {
        update.disconnected_at = new Date().toISOString();
        update.qr_code = null;
      }
      await admin.from("whatsapp_instances").update(update).eq("id", inst.id);
      await admin.from("channels").update({ status }).eq("id", inst.channel_id);
    }

    await admin.from("channel_sync_logs").insert({
      company_id: inst.company_id,
      channel_id: inst.channel_id,
      event_type: event || "unknown",
      payload,
      status: "ok",
    });

    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
