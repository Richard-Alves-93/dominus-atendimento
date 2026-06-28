import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, ShieldAlert } from "lucide-react";

interface CompanySettings {
  company_id: string;
  allow_stalled_takeover: boolean;
  stalled_minutes: number;
  same_department_only: boolean;
  notify_customer_on_department_transfer: boolean;
  protocol_enabled: boolean;
  protocol_prefix: string | null;
  protocol_format: string | null;
}

export default function Configuracoes() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { activeCompanyId, activeMembership } = useCompany();
  const { toast } = useToast();
  const isMaster = profile?.is_master === true || profile?.global_role === "master";
  const role = activeMembership?.role;
  const canManage = isMaster || role === "owner" || role === "admin";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allowTakeover, setAllowTakeover] = useState(true);
  const [stalledMinutes, setStalledMinutes] = useState(15);
  const [sameDeptOnly, setSameDeptOnly] = useState(true);
  const [notifyCustomerOnTransfer, setNotifyCustomerOnTransfer] = useState(false);
  const [protocolEnabled, setProtocolEnabled] = useState(false);
  const [protocolPrefix, setProtocolPrefix] = useState("");
  const [protocolFormat, setProtocolFormat] = useState("{PREFIX}-{YYYY}-{SEQUENCE_6}");
  const [defaultInboxDeptId, setDefaultInboxDeptId] = useState<string>("");
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!activeCompanyId) return;
    (supabase as any)
      .from("departments")
      .select("id, name")
      .eq("company_id", activeCompanyId)
      .eq("status", "active")
      .order("name")
      .then(({ data }: any) => setDepartments(data ?? []));
  }, [activeCompanyId]);

  useEffect(() => {
    if (!activeCompanyId) return;
    (supabase as any)
      .from("companies")
      .select("default_inbox_department_id")
      .eq("id", activeCompanyId)
      .maybeSingle()
      .then(({ data }: any) => setDefaultInboxDeptId(data?.default_inbox_department_id ?? ""));
  }, [activeCompanyId]);

  useEffect(() => {
    if (!activeCompanyId) return;
    setLoading(true);
    (async () => {
      const { data } = await (supabase as any)
        .from("company_settings")
        .select("*")
        .eq("company_id", activeCompanyId)
        .maybeSingle();
      const s = data as CompanySettings | null;
      if (s) {
        setAllowTakeover(s.allow_stalled_takeover);
        setStalledMinutes(s.stalled_minutes);
        setSameDeptOnly(s.same_department_only);
        setNotifyCustomerOnTransfer(Boolean(s.notify_customer_on_department_transfer));
        setProtocolEnabled(Boolean(s.protocol_enabled));
        setProtocolPrefix(s.protocol_prefix ?? "");
        setProtocolFormat(s.protocol_format ?? "{PREFIX}-{YYYY}-{SEQUENCE_6}");
      }
      setLoading(false);
    })();
  }, [activeCompanyId]);

  const handleSave = async () => {
    if (!activeCompanyId || !canManage) return;
    const minutes = Math.max(1, Math.min(1440, Math.floor(stalledMinutes || 15)));
    const prefix = protocolPrefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || null;
    const format = protocolFormat.trim() || "{PREFIX}-{YYYY}-{SEQUENCE_6}";
    setSaving(true);
    const payload = {
      company_id: activeCompanyId,
      allow_stalled_takeover: allowTakeover,
      stalled_minutes: minutes,
      same_department_only: sameDeptOnly,
      notify_customer_on_department_transfer: notifyCustomerOnTransfer,
      protocol_enabled: protocolEnabled,
      protocol_prefix: prefix,
      protocol_format: format,
    };
    const { error } = await (supabase as any)
      .from("company_settings")
      .upsert(payload, { onConflict: "company_id" });
    const { error: errCompany } = await (supabase as any)
      .from("companies")
      .update({ default_inbox_department_id: defaultInboxDeptId || null })
      .eq("id", activeCompanyId);
    setSaving(false);
    if (error || errCompany) {
      toast({ title: "Falha ao salvar", description: (error || errCompany)?.message, variant: "destructive" });
      return;
    }
    qc.setQueryData(["company-settings", activeCompanyId], payload);
    qc.invalidateQueries({ queryKey: ["company-settings", activeCompanyId] });
    toast({ title: "Configurações salvas" });
  };

  return (
    <AppLayout title="Configurações">
      <div className="p-6 max-w-3xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Configurações da empresa</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Preferências operacionais que se aplicam a toda a empresa ativa.
          </p>
        </div>

        <Card className="p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-foreground">Regras de Atendimento</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Defina quando um atendimento parado pode ser assumido por outro atendente.
            </p>
          </div>

          {!canManage && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Somente Administradores e Master podem alterar estas configurações.</span>
            </div>
          )}

          {loading ? (
            <div className="flex items-center text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Carregando...
            </div>
          ) : (
            <div className="space-y-5">
              <div className="space-y-2 max-w-md">
                <Label className="text-sm">Setor padrão de entrada</Label>
                <Select
                  value={defaultInboxDeptId || "__none__"}
                  onValueChange={(v) => setDefaultInboxDeptId(v === "__none__" ? "" : v)}
                  disabled={!canManage}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um setor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem setor padrão (fila geral)</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Novos atendimentos recebidos pelos canais entram automaticamente neste setor.
                </p>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label className="text-sm">Permitir que outro atendente assuma atendimento parado</Label>
                  <p className="text-xs text-muted-foreground">
                    Quando desligado, apenas Administrador/Gerente podem assumir.
                  </p>
                </div>
                <Switch
                  checked={allowTakeover}
                  onCheckedChange={setAllowTakeover}
                  disabled={!canManage}
                />
              </div>

              <div className="space-y-2 max-w-xs">
                <Label className="text-sm" htmlFor="stalled-min">
                  Tempo para considerar atendimento parado (minutos)
                </Label>
                <Input
                  id="stalled-min"
                  type="number"
                  min={1}
                  max={1440}
                  value={stalledMinutes}
                  onChange={(e) => setStalledMinutes(Number(e.target.value))}
                  disabled={!canManage}
                />
                <p className="text-xs text-muted-foreground">
                  Conta-se a partir da última mensagem do cliente sem resposta.
                </p>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label className="text-sm">Permitir assumir somente dentro do mesmo setor</Label>
                  <p className="text-xs text-muted-foreground">
                    Atendentes de outros setores não conseguirão assumir o atendimento.
                  </p>
                </div>
                <Switch
                  checked={sameDeptOnly}
                  onCheckedChange={setSameDeptOnly}
                  disabled={!canManage}
                />
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label className="text-sm">Avisar cliente ao transferir setor</Label>
                  <p className="text-xs text-muted-foreground">
                    Quando ativo, ao transferir um atendimento entre setores o cliente recebe
                    uma mensagem automática no WhatsApp informando o novo setor.
                  </p>
                </div>
                <Switch
                  checked={notifyCustomerOnTransfer}
                  onCheckedChange={setNotifyCustomerOnTransfer}
                  disabled={!canManage}
                />
              </div>

              <div className="border-t pt-5 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Protocolo de atendimento</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Gera um número de protocolo único para cada novo atendimento desta empresa.
                    Quando desativado, nenhum protocolo é gerado e atendimentos antigos não são alterados.
                  </p>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label className="text-sm">Ativar protocolo de atendimento</Label>
                    <p className="text-xs text-muted-foreground">
                      Disponibiliza a variável {"{{protocolo}}"} nas mensagens rápidas.
                    </p>
                  </div>
                  <Switch
                    checked={protocolEnabled}
                    onCheckedChange={setProtocolEnabled}
                    disabled={!canManage}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-xl">
                  <div className="space-y-2">
                    <Label className="text-sm" htmlFor="protocol-prefix">Prefixo</Label>
                    <Input
                      id="protocol-prefix"
                      placeholder="Ex.: DOM, ATD, RIV"
                      value={protocolPrefix}
                      onChange={(e) => setProtocolPrefix(e.target.value)}
                      disabled={!canManage || !protocolEnabled}
                      maxLength={10}
                    />
                    <p className="text-xs text-muted-foreground">Apenas letras e números. Vazio usa "ATD".</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm" htmlFor="protocol-format">Formato</Label>
                    <Input
                      id="protocol-format"
                      value={protocolFormat}
                      onChange={(e) => setProtocolFormat(e.target.value)}
                      disabled={!canManage || !protocolEnabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      Placeholders: {"{PREFIX}"}, {"{YYYY}"}, {"{SEQUENCE_6}"}.
                    </p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Exemplo: <span className="font-mono">{(protocolPrefix.trim().toUpperCase() || "ATD")}-{new Date().getFullYear()}-000001</span>
                </p>
              </div>




              <div className="pt-2">
                <Button
                  onClick={handleSave}
                  disabled={!canManage || saving}
                  className="gradient-primary text-primary-foreground"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Salvar alterações
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
