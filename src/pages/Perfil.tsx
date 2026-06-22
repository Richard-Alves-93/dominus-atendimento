import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Perfil() {
  const { user, profile, refresh } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    public_name: "",
    phone: "",
    signature: "",
    signature_enabled: true,
  });

  useEffect(() => {
    if (!profile) return;
    setForm({
      full_name: profile.full_name ?? "",
      public_name: profile.public_name ?? "",
      phone: profile.phone ?? "",
      signature: profile.signature ?? "",
      signature_enabled: profile.signature_enabled ?? true,
    });
  }, [profile]);

  const handleSave = async () => {
    if (!user) return;
    if (!form.full_name.trim()) {
      toast.error("Nome completo é obrigatório.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name.trim(),
        public_name: form.public_name.trim() || null,
        phone: form.phone.trim() || null,
        signature: form.signature.trim() || null,
        signature_enabled: form.signature_enabled,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    toast.success("Perfil atualizado.");
    await refresh();
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Meu Perfil</h1>
          <p className="text-sm text-muted-foreground">Gerencie seus dados e sua assinatura nas mensagens.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Dados pessoais</CardTitle>
            <CardDescription>Informações exibidas internamente no Dominus.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Nome completo *</Label>
              <Input
                id="full_name"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="public_name">Nome de exibição</Label>
              <Input
                id="public_name"
                value={form.public_name}
                onChange={(e) => setForm((f) => ({ ...f, public_name: e.target.value }))}
                placeholder="Como você quer ser identificado(a)"
              />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input value={profile?.email ?? ""} disabled />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Telefone / WhatsApp</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="(11) 99999-9999"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assinatura nas mensagens</CardTitle>
            <CardDescription>
              Quando ativada, o texto abaixo é anexado às mensagens de texto enviadas ao cliente.
              O Dominus sempre registra internamente quem enviou cada mensagem, mesmo com a assinatura desativada.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="signature">Texto da assinatura</Label>
              <Textarea
                id="signature"
                rows={2}
                value={form.signature}
                onChange={(e) => setForm((f) => ({ ...f, signature: e.target.value }))}
                placeholder="Ex.: João — Atendimento"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="sig-en"
                checked={form.signature_enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, signature_enabled: v }))}
              />
              <Label htmlFor="sig-en" className="cursor-pointer">
                Usar assinatura nas mensagens enviadas
              </Label>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            Salvar alterações
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
