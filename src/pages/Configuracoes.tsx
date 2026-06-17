import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
      }
      setLoading(false);
    })();
  }, [activeCompanyId]);

  const handleSave = async () => {
    if (!activeCompanyId || !canManage) return;
    const minutes = Math.max(1, Math.min(1440, Math.floor(stalledMinutes || 15)));
    setSaving(true);
    const { error } = await (supabase as any)
      .from("company_settings")
      .upsert(
        {
          company_id: activeCompanyId,
          allow_stalled_takeover: allowTakeover,
          stalled_minutes: minutes,
          same_department_only: sameDeptOnly,
          notify_customer_on_department_transfer: notifyCustomerOnTransfer,
        },
        { onConflict: "company_id" },
      );
    setSaving(false);
    if (error) {
      toast({ title: "Falha ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    qc.setQueryData(["company-settings", activeCompanyId], {
      company_id: activeCompanyId,
      allow_stalled_takeover: allowTakeover,
      stalled_minutes: minutes,
      same_department_only: sameDeptOnly,
      notify_customer_on_department_transfer: notifyCustomerOnTransfer,
    });
    qc.invalidateQueries({ queryKey: ["company-settings", activeCompanyId] });
    toast({ title: "Regras de atendimento salvas" });
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
