// Diagnóstico read-only de instâncias na Evolution API.
// Master-only. Sem ações destrutivas. Sem expor secrets.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const EVO_URL = Deno.env.get("EVOLUTION_API_URL");
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
const base = () => EVO_URL!.replace(/\/$/, "");
const headers = () => ({ "Content-Type": "application/json", apikey: EVO_KEY! });

async function fetchJson(url: string, init?: RequestInit) {
  try {
    const r = await fetch(url, { ...init, headers: { ...headers(), ...(init?.headers ?? {}) } });
    const text = await r.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 500); }
    return { status: r.status, ok: r.ok, body: parsed };
  } catch (e) {
    return { status: 0, ok: false, body: { error: (e as Error).message } };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!EVO_URL || !EVO_KEY) return json({ error: "Evolution não configurada" }, 500);

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: ures } = await userClient.auth.getUser();
    const user = ures.user;
    if (!user) return json({ error: "Unauthorized" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: prof } = await admin.from("profiles").select("is_master,global_role").eq("id", user.id).maybeSingle();
    if (!(prof?.is_master === true || prof?.global_role === "master")) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action: string = body?.action ?? "list";
    const phoneFilter: string | undefined = body?.phone; // ex 555191840532
    const instanceName: string | undefined = body?.instance_name;
    const sendTo: string | undefined = body?.send_to;
    const sendText: string = body?.text ?? "Diagnóstico Evolution";

    if (action === "list") {
      const list = await fetchJson(`${base()}/instance/fetchInstances`);
      const items: any[] = Array.isArray(list.body) ? list.body : (Array.isArray((list.body as any)?.instances) ? (list.body as any).instances : []);
      const norm = items.map((it: any) => {
        const inst = it?.instance ?? it;
        return {
          instanceName: inst?.instanceName ?? inst?.name ?? null,
          status: inst?.status ?? inst?.connectionStatus ?? inst?.state ?? null,
          ownerJid: inst?.owner ?? inst?.ownerJid ?? inst?.wuid ?? null,
          profileName: inst?.profileName ?? null,
          integration: inst?.integration ?? null,
          serverUrl: inst?.serverUrl ?? null,
          createdAt: inst?.createdAt ?? null,
          updatedAt: inst?.updatedAt ?? null,
        };
      });
      const filtered = phoneFilter
        ? norm.filter((i) => (i.ownerJid ?? "").includes(phoneFilter) || (i.instanceName ?? "").includes(phoneFilter))
        : norm;
      const { data: dbInstances } = await admin.from("whatsapp_instances").select("instance_name, company_id, channel_id, status");
      const dbSet = new Set((dbInstances ?? []).map((d) => d.instance_name));
      const annotated = filtered.map((i) => ({
        ...i,
        in_dominus_db: i.instanceName ? dbSet.has(i.instanceName) : false,
      }));
      return json({ ok: true, total_in_evolution: norm.length, returned: annotated.length, instances: annotated, dominus_db_instances: dbInstances });
    }

    if (action === "state" && instanceName) {
      const st = await fetchJson(`${base()}/instance/connectionState/${instanceName}`);
      const wh = await fetchJson(`${base()}/webhook/find/${instanceName}`);
      return json({ ok: true, instance: instanceName, connectionState: st, webhook: wh });
    }

    if (action === "send_test" && instanceName && sendTo) {
      // ONLY send if explicitly called with both params. Read-only by default.
      const payload = { number: sendTo, text: sendText };
      const res = await fetchJson(`${base()}/message/sendText/${instanceName}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const safe = {
        status: res.status,
        ok: res.ok,
        key_id: (res.body as any)?.key?.id ?? null,
        key_remoteJid: (res.body as any)?.key?.remoteJid ?? null,
        message_status: (res.body as any)?.status ?? null,
        message_timestamp: (res.body as any)?.messageTimestamp ?? null,
        error_message: (res.body as any)?.message ?? (res.body as any)?.error ?? null,
      };
      return json({ ok: true, instance: instanceName, sent_to: sendTo, response: safe });
    }

    return json({ error: "ação inválida. use: list | state | send_test" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
