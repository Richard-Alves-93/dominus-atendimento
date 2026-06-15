import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function Cadastro() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    companyName: "",
    fullName: "",
    email: "",
    phone: "",
    plan: "trial",
    password: "",
  });

  const update = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 8) {
      toast.error("A senha precisa ter ao menos 8 caracteres");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("signup-company", { body: form });
      if (error || (data as { error?: string })?.error) {
        toast.error((data as { error?: string })?.error ?? error?.message ?? "Erro no cadastro");
        return;
      }
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      if (signInErr) {
        toast.error("Cadastro criado, faça login.");
        navigate("/auth", { replace: true });
        return;
      }
      const companyId = (data as { companyId?: string }).companyId;
      if (companyId) localStorage.setItem("dominus.activeCompanyId", companyId);
      toast.success("Empresa cadastrada com sucesso!");
      navigate("/app", { replace: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">Dominus Atendimento</span>
          </div>
          <h2 className="text-2xl font-bold">Cadastre sua empresa</h2>
          <p className="text-muted-foreground text-sm">Comece grátis com o plano trial.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da empresa</Label>
              <Input value={form.companyName} onChange={update("companyName")} required maxLength={120} />
            </div>
            <div className="space-y-2">
              <Label>Seu nome</Label>
              <Input value={form.fullName} onChange={update("fullName")} required maxLength={120} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input type="email" value={form.email} onChange={update("email")} required />
              </div>
              <div className="space-y-2">
                <Label>WhatsApp</Label>
                <Input value={form.phone} onChange={update("phone")} placeholder="(11) 99999-9999" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Plano</Label>
              <Select value={form.plan} onValueChange={(v) => setForm((p) => ({ ...p, plan: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">Teste (14 dias grátis)</SelectItem>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Senha</Label>
              <Input type="password" value={form.password} onChange={update("password")} required minLength={8} />
              <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
            </div>
            <Button type="submit" disabled={loading} className="w-full h-11 gradient-primary text-primary-foreground">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar conta"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Já tem conta? <Link to="/auth" className="text-primary font-medium hover:underline">Entrar</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
