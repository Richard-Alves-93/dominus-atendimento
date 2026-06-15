import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function TrocarSenha() {
  const navigate = useNavigate();
  const { user, profile, loading, refresh } = useAuth();
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate("/auth", { replace: true });
  }, [user, loading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (p1.length < 8) return toast.error("A senha deve ter ao menos 8 caracteres");
    if (p1 !== p2) return toast.error("As senhas não conferem");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: p1 });
    if (error) {
      setBusy(false);
      return toast.error(error.message);
    }
    const { error: pErr } = await supabase
      .from("profiles")
      .update({ must_change_password: false, password_changed_at: new Date().toISOString() })
      .eq("id", user!.id);
    setBusy(false);
    if (pErr) return toast.error(pErr.message);
    toast.success("Senha alterada com sucesso");
    await refresh(user!.id);
    const isMaster = profile?.is_master === true || profile?.global_role === "master";
    navigate(isMaster ? "/master" : "/app", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
            <KeyRound className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold">Trocar senha</h1>
          <p className="text-sm text-muted-foreground">
            Por segurança, defina uma nova senha antes de continuar.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="p1">Nova senha</Label>
              <Input id="p1" type="password" value={p1} onChange={(e) => setP1(e.target.value)} required minLength={8} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p2">Confirmar nova senha</Label>
              <Input id="p2" type="password" value={p2} onChange={(e) => setP2(e.target.value)} required minLength={8} />
            </div>
            <Button type="submit" disabled={busy} className="w-full gradient-primary text-primary-foreground">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Alterar senha"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
