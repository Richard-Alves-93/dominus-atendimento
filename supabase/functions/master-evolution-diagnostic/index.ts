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

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const auth = req.headers.get("Authorization") ?? "";
    const opsSecret = req.headers.get("x-master-ops-secret") ?? "";
    let isMaster = false;
    const MASTER_OPS_SECRET = Deno.env.get("MASTER_OPS_SECRET") ?? "";
    if (MASTER_OPS_SECRET && opsSecret && opsSecret === MASTER_OPS_SECRET) {
      isMaster = true;
    } else if (auth.startsWith("Bearer ")) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
      const { data: ures } = await userClient.auth.getUser();
      const user = ures.user;
      if (user) {
        const { data: prof } = await admin.from("profiles").select("is_master,global_role").eq("id", user.id).maybeSingle();
        isMaster = prof?.is_master === true || prof?.global_role === "master";
      }
    }

    const body = await req.json().catch(() => ({}));
    const action: string = body?.action ?? "list";
    // send_test exige master autenticado; list/state são read-only de diagnóstico.
    if (action === "send_test" && !isMaster) return json({ error: "Forbidden (send_test requer master)" }, 403);
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

    // cleanup_orphan: identifica e (opcionalmente) executa logout/delete em instâncias órfãs
    // SEGURANÇA:
    //  - master only
    //  - só atua em instâncias que NÃO existem em whatsapp_instances do Dominus
    //  - precisa do mesmo ownerJid da current_instance_name
    //  - precisa compartilhar prefixo `dominus_<slug>_<8>` da current
    //  - instanceName != current
    //  - dry_run=true por padrão; precisa confirm=true E dry_run=false para executar
    //  - mode: "logout" (default) | "delete" (delete só se mode="delete")
    if (action === "cleanup_orphan") {
      if (!isMaster) return json({ error: "Forbidden (cleanup_orphan requer master)" }, 403);
      const currentName: string | undefined = body?.current_instance_name;
      const dryRun: boolean = body?.dry_run !== false; // default true
      const confirm: boolean = body?.confirm === true;
      const mode: "logout" | "delete" = body?.mode === "delete" ? "delete" : "logout";
      if (!currentName) return json({ error: "current_instance_name obrigatório" }, 400);

      // valida current está no banco Dominus
      const { data: currentDb } = await admin
        .from("whatsapp_instances")
        .select("instance_name, company_id, channel_id")
        .eq("instance_name", currentName)
        .maybeSingle();
      if (!currentDb) return json({ error: "current_instance_name não pertence ao banco Dominus" }, 400);

      // descobre ownerJid e prefixo da current via Evolution
      const list = await fetchJson(`${base()}/instance/fetchInstances`);
      const items: any[] = Array.isArray(list.body) ? list.body : (Array.isArray((list.body as any)?.instances) ? (list.body as any).instances : []);
      const norm = items.map((it: any) => {
        const inst = it?.instance ?? it;
        return {
          instanceName: inst?.instanceName ?? inst?.name ?? null,
          ownerJid: inst?.owner ?? inst?.ownerJid ?? inst?.wuid ?? null,
          profileName: inst?.profileName ?? null,
          status: inst?.status ?? inst?.connectionStatus ?? inst?.state ?? null,
        };
      });
      const current = norm.find((i) => i.instanceName === currentName);
      if (!current) return json({ error: "current_instance_name não encontrada na Evolution" }, 404);
      const ownerJid: string | null = current.ownerJid;
      if (!ownerJid) return json({ error: "current não possui ownerJid; abortar" }, 400);

      // prefixo compartilhado: tudo antes do último "_v\d+" (se houver), senão o próprio nome
      const prefixMatch = currentName.match(/^(.*?)(?:_v\d+)?$/);
      const prefix = prefixMatch?.[1] ?? currentName;

      const { data: dbInstances } = await admin.from("whatsapp_instances").select("instance_name");
      const dbSet = new Set((dbInstances ?? []).map((d) => d.instance_name));

      const candidates = norm.filter((i) =>
        i.instanceName &&
        i.instanceName !== currentName &&
        i.ownerJid === ownerJid &&
        i.instanceName.startsWith(prefix) &&
        !dbSet.has(i.instanceName)
      );

      const maskJid = (j: string | null) => (j ? j.replace(/(\d{4})\d+(\d{4})/, "$1***$2") : null);

      // dry_run: apenas devolve plano
      if (dryRun || !confirm) {
        return json({
          ok: true,
          dry_run: true,
          executed: false,
          mode,
          current_instance_name: currentName,
          ownerJid_masked: maskJid(ownerJid),
          prefix,
          candidates: candidates.map((c) => ({
            instanceName: c.instanceName,
            profileName: c.profileName,
            status: c.status,
            ownerJid_masked: maskJid(c.ownerJid),
          })),
          note: "Nenhuma ação destrutiva executada. Para executar: confirm=true e dry_run=false.",
        });
      }

      // EXECUÇÃO (não chamada nesta rodada — código pronto)
      const results: any[] = [];
      for (const c of candidates) {
        const name = c.instanceName as string;
        const logoutRes = await fetchJson(`${base()}/instance/logout/${name}`, { method: "DELETE" });
        await admin.from("audit_logs").insert({
          event_type: "evolution.orphan_logout",
          company_id: currentDb.company_id,
          metadata: {
            source: "master-evolution-diagnostic.cleanup_orphan",
            company_id: currentDb.company_id,
            current_instance_name: currentName,
            orphan_instance_name: name,
            ownerJid_masked: maskJid(c.ownerJid),
            action: "logout",
            result: { status: logoutRes.status, ok: logoutRes.ok },
          },
        });
        let deleteRes: any = null;
        if (mode === "delete") {
          deleteRes = await fetchJson(`${base()}/instance/delete/${name}`, { method: "DELETE" });
          await admin.from("audit_logs").insert({
            event_type: "evolution.orphan_delete",
            company_id: currentDb.company_id,
            metadata: {
              source: "master-evolution-diagnostic.cleanup_orphan",
              company_id: currentDb.company_id,
              current_instance_name: currentName,
              orphan_instance_name: name,
              ownerJid_masked: maskJid(c.ownerJid),
              action: "delete",
              result: { status: deleteRes.status, ok: deleteRes.ok },
            },
          });
        }
        results.push({
          instanceName: name,
          logout: { status: logoutRes.status, ok: logoutRes.ok },
          delete: deleteRes ? { status: deleteRes.status, ok: deleteRes.ok } : null,
        });
      }
      return json({ ok: true, dry_run: false, executed: true, mode, current_instance_name: currentName, results });
    }

    // hard_reset: logout → delete → create (mesmo nome) → set webhook → connect (QR)
    // Master only. Exige confirm=true. Atua apenas em uma instância existente em whatsapp_instances.
    if (action === "hard_reset") {
      if (!isMaster) return json({ error: "Forbidden (hard_reset requer master)" }, 403);
      if (body?.confirm !== true) return json({ error: "confirm=true obrigatório" }, 400);
      if (!instanceName) return json({ error: "instance_name obrigatório" }, 400);

      const { data: dbInst } = await admin
        .from("whatsapp_instances")
        .select("id, instance_name, company_id, channel_id")
        .eq("instance_name", instanceName)
        .maybeSingle();
      if (!dbInst) return json({ error: "instance_name não pertence ao Dominus" }, 400);

      const webhookUrl = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/evolution-webhook`;
      const webhookEvents = [
        "QRCODE_UPDATED","CONNECTION_UPDATE","MESSAGES_UPSERT",
        "MESSAGES_UPDATE","MESSAGES_SET","SEND_MESSAGE",
      ];

      // 1. logout (best-effort)
      const logoutRes = await fetchJson(`${base()}/instance/logout/${instanceName}`, { method: "DELETE" });
      // 2. delete (best-effort)
      const deleteRes = await fetchJson(`${base()}/instance/delete/${instanceName}`, { method: "DELETE" });
      // 3. create same name
      const createRes = await fetchJson(`${base()}/instance/create`, {
        method: "POST",
        body: JSON.stringify({
          instanceName,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
          webhook: { url: webhookUrl, byEvents: false, base64: true, events: webhookEvents },
        }),
      });
      // 4. set webhook (idempotente, garante config)
      const webhookRes = await fetchJson(`${base()}/webhook/set/${instanceName}`, {
        method: "POST",
        body: JSON.stringify({
          url: webhookUrl, enabled: true, webhookByEvents: false, webhookBase64: true, events: webhookEvents,
        }),
      });
      // 5. connect → QR
      const connectRes = await fetchJson(`${base()}/instance/connect/${instanceName}`);
      const qr = (connectRes.body as any)?.base64 ?? (connectRes.body as any)?.qrcode?.base64 ?? (connectRes.body as any)?.code ?? null;

      // 6. atualizar DB do Dominus (status pending, novo QR)
      await admin.from("whatsapp_instances").update({
        status: "pending",
        qr_code: qr,
        webhook_configured: webhookRes.ok,
        events_configured: webhookRes.ok,
        last_settings_sync_at: new Date().toISOString(),
        settings_sync_error: webhookRes.ok ? null : `webhook_set_status=${webhookRes.status}`,
      }).eq("id", dbInst.id);
      await admin.from("channels").update({ status: "pending", qr_code: qr }).eq("id", dbInst.channel_id);

      await admin.from("audit_logs").insert({
        event_type: "evolution.hard_reset",
        company_id: dbInst.company_id,
        metadata: {
          source: "master-evolution-diagnostic.hard_reset",
          instance_name: instanceName,
          logout: { status: logoutRes.status, ok: logoutRes.ok },
          delete: { status: deleteRes.status, ok: deleteRes.ok },
          create: { status: createRes.status, ok: createRes.ok },
          webhook: { status: webhookRes.status, ok: webhookRes.ok },
          connect: { status: connectRes.status, ok: connectRes.ok, has_qr: Boolean(qr) },
        },
      });

      return json({
        ok: true,
        instance_name: instanceName,
        steps: {
          logout: { status: logoutRes.status, ok: logoutRes.ok },
          delete: { status: deleteRes.status, ok: deleteRes.ok },
          create: { status: createRes.status, ok: createRes.ok, body_keys: Object.keys((createRes.body as any) ?? {}) },
          webhook: { status: webhookRes.status, ok: webhookRes.ok },
          connect: { status: connectRes.status, ok: connectRes.ok, has_qr: Boolean(qr) },
        },
        next: "Abra /app/conexoes e escaneie o QR Code.",
      });
    }

    return json({ error: "ação inválida. use: list | state | send_test | cleanup_orphan | hard_reset" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
