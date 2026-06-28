import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const cronSecret = Deno.env.get("MONITORING_CRON_SECRET") || Deno.env.get("CRON_SECRET");
    const provided = req.headers.get("x-cron-secret");
    const auth = req.headers.get("Authorization") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const isCron = cronSecret && provided && provided === cronSecret;
    const isService = auth.startsWith("Bearer ") && auth.slice(7) === serviceKey;

    // Default limit; users get a smaller cap.
    let limit = 25;
    let worker = "edge";

    if (!isCron && !isService) {
      // User-authenticated immediate trigger (JWT validated via getClaims).
      if (!auth.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(url, anonKey, {
        global: { headers: { Authorization: auth } },
      });
      const token = auth.slice(7);
      const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
      if (claimsErr || !claims?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      limit = 10;
      worker = `user:${claims.claims.sub}`;
    }

    try {
      if (req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        if (typeof body?.limit === "number" && body.limit > 0 && body.limit <= (isCron || isService ? 200 : 10)) {
          limit = body.limit;
        }
      }
    } catch { /* ignore */ }

    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data, error } = await supabase.rpc("process_tag_automation_jobs", {
      _limit: limit, _worker: worker,
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
