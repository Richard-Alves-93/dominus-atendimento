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
function fail(step: string, message: string) {
  console.error("[RESET_PWD] fail", step, message);
  return json({ ok: false, step, error: message }, 200);
}

function genPassword(len = 10): string {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const b = "abcdefghijkmnopqrstuvwxyz";
  const n = "23456789";
  const s = "!@#$%&*";
  const all = a + b + n + s;
  let out =
    a[Math.floor(Math.random() * a.length)] +
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
    const target_user_id: string = payload.user_id;
    if (!company_id || !target_user_id) return fail("payload", "Campos obrigatórios faltando");
    if (callerId === target_user_id) return fail("authz", "Use a troca de senha pessoal para sua própria conta");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // authz: master OR owner/admin of company
    const { data: callerProfile } = await admin
      .from("profiles").select("is_master").eq("id", callerId).maybeSingle();
    let allowed = callerProfile?.is_master === true;
    if (!allowed) {
      const { data: member } = await admin
        .from("company_users").select("role")
        .eq("user_id", callerId).eq("company_id", company_id).eq("status", "active").maybeSingle();
      allowed = member?.role === "owner" || member?.role === "admin";
    }
    if (!allowed) return fail("authz", "Sem permissão para redefinir senha");

    // target must be active member of company
    const { data: targetCU } = await admin
      .from("company_users").select("status")
      .eq("user_id", target_user_id).eq("company_id", company_id).maybeSingle();
    if (!targetCU) return fail("target", "Usuário não pertence a esta empresa");
    if (targetCU.status !== "active") return fail("target_disabled", "Reative o usuário antes de redefinir a senha");

    const { data: targetProfile } = await admin
      .from("profiles").select("full_name, email, phone").eq("id", target_user_id).maybeSingle();
    if (!targetProfile?.email) return fail("target", "Usuário sem e-mail cadastrado");

    const { data: company } = await admin.from("companies").select("name").eq("id", company_id).maybeSingle();

    const tempPassword = genPassword(10);

    const { error: updErr } = await admin.auth.admin.updateUserById(target_user_id, {
      password: tempPassword,
    });
    if (updErr) return fail("auth_update", updErr.message);

    await admin.from("profiles").update({
      must_change_password: true,
      temporary_password_set_at: new Date().toISOString(),
      password_changed_at: null,
    }).eq("id", target_user_id);

    // Send WhatsApp
    let waSent = false;
    let waError: string | null = null;
    const phone = (targetProfile.phone ?? "").trim();
    if (phone && EVO_URL && EVO_KEY) {
      const { data: instance } = await admin
        .from("whatsapp_instances")
        .select("instance_name, status")
        .eq("company_id", company_id).eq("status", "connected").maybeSingle();
      if (instance?.instance_name) {
        const number = phone.replace(/\D/g, "");
        const text =
`Olá, ${targetProfile.full_name ?? ""}.

Sua senha de acesso ao Dominus Atendimento foi redefinida pela administração da empresa ${company?.name ?? ""}.

Acesse: ${APP_URL}/auth

Login: ${targetProfile.email}
Nova senha provisória: ${tempPassword}

No próximo acesso, você será obrigado a trocar sua senha.`;
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

    return json({ ok: true, wa_sent: waSent, wa_error: waError });
  } catch (e) {
    return fail("exception", String((e as Error).message ?? e));
  }
});
