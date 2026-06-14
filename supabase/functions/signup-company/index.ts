import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SignupPayload {
  companyName: string;
  email: string;
  password: string;
  phone?: string;
  fullName?: string;
  plan?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as SignupPayload;
    const companyName = (body.companyName ?? "").trim();
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    const phone = (body.phone ?? "").trim();
    const fullName = (body.fullName ?? companyName).trim();

    if (!companyName || companyName.length > 120) {
      return json({ error: "Nome da empresa inválido" }, 400);
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
      return json({ error: "E-mail inválido" }, 400);
    }
    if (!password || password.length < 8 || password.length > 200) {
      return json({ error: "Senha deve ter ao menos 8 caracteres" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // 1) Create auth user (auto-confirm)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, phone },
    });
    if (createErr || !created.user) {
      return json({ error: createErr?.message ?? "Falha ao criar usuário" }, 400);
    }
    const userId = created.user.id;

    // 2) Ensure profile (trigger handles it, but enforce metadata fields)
    await admin.from("profiles").upsert({
      id: userId,
      email,
      full_name: fullName,
      phone,
    });

    // 3) Create company
    const { data: company, error: companyErr } = await admin
      .from("companies")
      .insert({
        name: companyName,
        email,
        phone,
        status: "trial",
      })
      .select()
      .single();
    if (companyErr || !company) {
      await admin.auth.admin.deleteUser(userId);
      return json({ error: companyErr?.message ?? "Falha ao criar empresa" }, 500);
    }

    // 4) Link as owner
    const { error: linkErr } = await admin.from("company_users").insert({
      company_id: company.id,
      user_id: userId,
      role: "owner",
      status: "active",
    });
    if (linkErr) {
      await admin.from("companies").delete().eq("id", company.id);
      await admin.auth.admin.deleteUser(userId);
      return json({ error: linkErr.message }, 500);
    }

    return json({ success: true, companyId: company.id, userId });
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
