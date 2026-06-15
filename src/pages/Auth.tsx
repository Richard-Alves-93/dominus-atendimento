import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Zap, Eye, EyeOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import loginBg from "@/assets/login-bg.jpg";

export default function Auth() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) {
        toast.error(error.message === "Invalid login credentials" ? "E-mail ou senha inválidos" : error.message);
        return;
      }
      if (!data.user) {
        toast.error("Falha ao autenticar");
        return;
      }

      console.log("[LOGIN_DEBUG] auth user id:", data.user.id, "email:", data.user.email);

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, email, is_master, global_role, must_change_password")
        .eq("id", data.user.id)
        .maybeSingle();

      console.log("[LOGIN_DEBUG] profile:", profile, "error:", profileError);

      const isMaster = profile?.is_master === true || profile?.global_role === "master";

      await refresh(data.user.id);

      if (profile?.must_change_password) {
        navigate("/trocar-senha", { replace: true });
        return;
      }

      if (isMaster) {
        navigate("/master", { replace: true });
        return;
      }

      const { data: memberships } = await supabase
        .from("company_users")
        .select("company_id, company:companies(id, status)")
        .eq("user_id", data.user.id)
        .eq("status", "active");
      const list = (memberships ?? []) as Array<{ company_id: string; company: { id: string; status: string } | null }>;
      if (list.length === 0) {
        toast.error("Sua conta não está vinculada a nenhuma empresa. Contate o administrador.");
        await supabase.auth.signOut();
        return;
      }
      const allowed = list.filter((m) => m.company?.status === "active" || m.company?.status === "trial");
      if (allowed.length === 0) {
        navigate("/empresa-bloqueada", { replace: true });
        return;
      }
      if (allowed.length === 1) {
        localStorage.setItem("dominus.activeCompanyId", allowed[0].company_id);
        navigate("/app", { replace: true });
      } else {
        navigate("/selecionar-empresa", { replace: true });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center overflow-hidden">
        <img src={loginBg} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/80 to-primary/40 backdrop-blur-sm" />
        <div className="relative z-10 text-center px-12">
          <div className="flex items-center justify-center mb-6">
            <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center shadow-elevated">
              <Zap className="w-7 h-7 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-primary-foreground mb-4">Dominus Atendimento</h1>
          <p className="text-lg text-primary-foreground/80 max-w-md">
            Centralize WhatsApp, Instagram, Facebook e e-mail em um só lugar.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <Card className="w-full max-w-md border-0 shadow-none bg-transparent">
          <CardHeader className="text-center space-y-2 pb-2">
            <div className="flex items-center justify-center gap-2 lg:hidden mb-4">
              <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold">Dominus</span>
            </div>
            <h2 className="text-2xl font-bold">Bem-vindo de volta</h2>
            <p className="text-muted-foreground">Entre com suas credenciais para acessar</p>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" placeholder="seu@email.com" value={email}
                  onChange={(e) => setEmail(e.target.value)} required className="h-11 bg-secondary" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? "text" : "password"} placeholder="••••••••"
                    value={password} onChange={(e) => setPassword(e.target.value)} required
                    className="h-11 bg-secondary pr-10" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" disabled={loading} className="w-full h-11 gradient-primary text-primary-foreground font-medium">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Entrar"}
              </Button>
            </form>
            <p className="text-center text-sm text-muted-foreground mt-6">
              Não tem conta?{" "}
              <Link to="/cadastro" className="text-primary font-medium hover:underline">Cadastre sua empresa</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
