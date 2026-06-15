import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVO_URL = Deno.env.get("EVOLUTION_API_URL");
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY");

const APP_URL = (Deno.env.get("APP_PUBLIC_URL") ?? "https://dominus-atendimento.lovable.app").replace(/\/+$/, "");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function fail(step: string, message: string, extra: Record<string, unknown> = {}) {
  console.error("[CREATE_USER] fail", step, message);
  return json({ ok: false, step, error: message, ...extra }, 200);
}

function genPassword(len = 10): string {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const b = "abcdefghijkmnopqrstuvwxyz";
  const n = "23456789";
  const s = "!@#$%&*";
  const all = a + b + n + s;
  let out = a[Math.floor(Math.random() * a.length)] +
            b[Math.floor(Math.random() * b.length)] +
            n[Math.floor(Math.random() * n.length)] +
            s[Math.floor(Math.random() * s.length)];
  for (let i = out.length; i < len; i++) out += all[Math.floor(Math.random() * all.length)];
  return out.split("").sort(() => Math.random() - 0.5).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return fail("auth", "Missing bearer token");

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return fail("auth", "Invalid session");
    const callerId = userData.user.id;

    const payload = await req.json().catch(() => ({} as any));
    const company_id: string = payload.company_id;
    const full_name: string = (payload.full_name ?? "").trim();
    const email: string = (payload.email ?? "").trim().toLowerCase();
    const phone: string = (payload.phone ?? "").trim();
    const role: string = payload.role ?? "agent";
    const department_ids: string[] = Array.isArray(payload.department_ids) ? payload.department_ids : [];
    const signature: string | null = payload.signature?.trim() || null;
    const signature_enabled: boolean = payload.signature_enabled !== false;

    if (!company_id || !full_name || !email) return fail("payload", "Campos obrigatórios faltando");
    if (!["owner", "admin", "manager", "agent", "financial"].includes(role)) return fail("payload", "Cargo inválido");
    if ((role === "agent" || role === "financial") && department_ids.length > 1) {
      return fail("payload", "Este cargo permite vínculo com apenas um setor.");
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // authz: caller is master OR owner/admin of company
    const { data: profile } = await admin.from("profiles").select("is_master").eq("id", callerId).maybeSingle();
    let allowed = profile?.is_master === true;
    if (!allowed) {
      const { data: member } = await admin
        .from("company_users").select("role")
        .eq("user_id", callerId).eq("company_id", company_id).eq("status", "active").maybeSingle();
      allowed = member?.role === "owner" || member?.role === "admin";
    }
    if (!allowed) return fail("authz", "Sem permissão para gerenciar a equipe");

    const { data: company } = await admin.from("companies").select("name").eq("id", company_id).maybeSingle();
    if (!company) return fail("company", "Empresa não encontrada");

    // Block duplicate email (profiles + auth.users)
    const { data: existingProfile } = await admin
      .from("profiles").select("id").eq("email", email).maybeSingle();
    if (existingProfile) {
      return fail("duplicate_email", "Este e-mail já está cadastrado. Use outro e-mail ou edite o usuário existente.");
    }
    {
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const existingAuth = list?.users.find((u) => (u.email ?? "").toLowerCase() === email);
      if (existingAuth) {
        return fail("duplicate_email", "Este e-mail já está cadastrado. Use outro e-mail ou edite o usuário existente.");
      }
    }

    const tempPassword = genPassword(10);

    // Create auth user
    let userId: string | null = null;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name, phone },
    });
    if (createErr) return fail("auth_create", createErr.message);
    userId = created.user!.id;

    // Upsert profile
    await admin.from("profiles").upsert({
      id: userId!,
      email,
      full_name,
      phone: phone || null,
      signature,
      signature_enabled,
      must_change_password: true,
      temporary_password_set_at: new Date().toISOString(),
    }, { onConflict: "id" });

    // Upsert company_users (revive disabled)
    const { data: existingCU } = await admin
      .from("company_users").select("id")
      .eq("user_id", userId).eq("company_id", company_id).maybeSingle();
    if (existingCU) {
      await admin.from("company_users").update({
        role, status: "active",
        disabled_at: null, disabled_by: null, disabled_reason: null, delete_after: null,
      }).eq("id", existingCU.id);
    } else {
      const { error: cuErr } = await admin.from("company_users").insert({
        user_id: userId, company_id, role, status: "active",
      });
      if (cuErr) return fail("company_users", cuErr.message);
    }

    // Replace department links
    await admin.from("department_users").delete().eq("user_id", userId).eq("company_id", company_id);
    if (department_ids.length > 0) {
      const rows = department_ids.map((dep) => ({
        user_id: userId, company_id, department_id: dep,
        role: role === "manager" ? "manager" : "agent",
        status: "active",
      }));
      const { error: duErr } = await admin.from("department_users").insert(rows);
      if (duErr) console.error("[CREATE_USER] department_users", duErr.message);
    }

    // Send WhatsApp with credentials via company's connected instance
    let waSent = false;
    let waError: string | null = null;
    if (phone && EVO_URL && EVO_KEY) {
      const { data: instance } = await admin
        .from("whatsapp_instances")
        .select("instance_name, status")
        .eq("company_id", company_id).eq("status", "connected").maybeSingle();
      if (instance?.instance_name) {
        const number = phone.replace(/\D/g, "");
        const text =
`Olá, ${full_name}.

Você foi cadastrado como atendente no Dominus Atendimento da empresa ${company.name}.

Acesse: ${APP_URL}/auth

Login: ${email}
Senha provisória: ${tempPassword}

No primeiro acesso, você será obrigado a trocar sua senha.`;
        try {
          const r = await fetch(
            `${EVO_URL.replace(/\/$/, "")}/message/sendText/${instance.instance_name}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: EVO_KEY },
              body: JSON.stringify({ number, text }),
            },
          );
          waSent = r.ok;
          if (!r.ok) waError = `Evolution ${r.status}`;
        } catch (e) {
          waError = String((e as Error).message ?? e);
        }
      } else {
        waError = "Nenhuma instância WhatsApp conectada";
      }
    } else if (!phone) {
      waError = "Usuário sem telefone";
    }

    return json({ ok: true, user_id: userId, wa_sent: waSent, wa_error: waError });
  } catch (e) {
    return fail("exception", String((e as Error).message ?? e));
  }
});
