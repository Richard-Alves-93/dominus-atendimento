import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, LogOut } from "lucide-react";

export default function SelecionarEmpresa() {
  const navigate = useNavigate();
  const { memberships, signOut } = useAuth();
  const { setActiveCompanyId } = useCompany();

  const choose = (id: string) => {
    setActiveCompanyId(id);
    navigate("/app", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">Selecione uma empresa</h1>
          <p className="text-muted-foreground">Escolha qual empresa deseja acessar agora.</p>
        </div>
        <div className="grid gap-3">
          {memberships.map((m) => (
            <Card key={m.id} className="p-4 flex items-center justify-between hover:border-primary/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">{m.company?.name ?? "Empresa"}</p>
                  <p className="text-xs text-muted-foreground capitalize">{m.role} · {m.company?.status}</p>
                </div>
              </div>
              <Button onClick={() => choose(m.company_id)} className="gradient-primary text-primary-foreground">
                Entrar
              </Button>
            </Card>
          ))}
        </div>
        <div className="mt-6 text-center">
          <Button variant="ghost" onClick={() => { void signOut(); navigate("/auth"); }}>
            <LogOut className="w-4 h-4 mr-2" /> Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
