import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MASTER_EMAIL = "crmdominus@gmail.com";
const MASTER_PASSWORD = "Admin@Dominus2026";
const MASTER_NAME = "Master Dominus";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Try to find existing user by listing (paginate just first page; expect tiny userbase here)
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    let user = list.users.find((u) => u.email?.toLowerCase() === MASTER_EMAIL);

    if (!user) {
      const { data: created, error } = await admin.auth.admin.createUser({
        email: MASTER_EMAIL,
        password: MASTER_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: MASTER_NAME },
      });
      if (error || !created.user) {
        return json({ error: error?.message ?? "Falha ao criar Master" }, 500);
      }
      user = created.user;
    }

    // Upsert profile as master
    const { error: profileErr } = await admin.from("profiles").upsert({
      id: user.id,
      email: MASTER_EMAIL,
      full_name: MASTER_NAME,
      is_master: true,
      global_role: "master",
    });
    if (profileErr) return json({ error: profileErr.message }, 500);

    return json({ success: true, userId: user.id, email: MASTER_EMAIL });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
