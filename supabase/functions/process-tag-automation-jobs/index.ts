import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Cron secret check (preferred). Allow service_role bearer as fallback for manual runs.
    const cronSecret = Deno.env.get("MONITORING_CRON_SECRET") || Deno.env.get("CRON_SECRET");
    const provided = req.headers.get("x-cron-secret");
    const auth = req.headers.get("Authorization") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const allowed =
      (cronSecret && provided && provided === cronSecret) ||
      (auth.startsWith("Bearer ") && auth.slice(7) === serviceKey);
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

    let limit = 25;
    try {
      if (req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        if (typeof body?.limit === "number" && body.limit > 0 && body.limit <= 200) limit = body.limit;
      }
    } catch { /* ignore */ }

    const { data, error } = await supabase.rpc("process_tag_automation_jobs", {
      _limit: limit, _worker: "edge",
    });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, result: data?.[0] ?? null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
