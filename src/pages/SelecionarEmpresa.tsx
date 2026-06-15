import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, LogOut, Lock } from "lucide-react";
import { isCompanyAllowed } from "@/lib/companyStatus";

export default function SelecionarEmpresa() {
  const navigate = useNavigate();
  const { memberships, signOut } = useAuth();
  const { setActiveCompanyId } = useCompany();

  const choose = (id: string, status?: string | null) => {
    if (!isCompanyAllowed(status)) return;
    setActiveCompanyId(id);
    navigate("/app", { replace: true });
  };

  const anyAllowed = memberships.some((m) => isCompanyAllowed(m.company?.status));

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">Selecione uma empresa</h1>
          <p className="text-muted-foreground">Escolha qual empresa deseja acessar agora.</p>
        </div>
        {!anyAllowed && (
          <Card className="p-4 mb-4 border-destructive/30 bg-destructive/5 text-sm text-destructive">
            Nenhuma das suas empresas está ativa no momento.
          </Card>
        )}
        <div className="grid gap-3">
          {memberships.map((m) => {
            const allowed = isCompanyAllowed(m.company?.status);
            return (
              <Card
                key={m.id}
                className={`p-4 flex items-center justify-between transition-colors ${
                  allowed ? "hover:border-primary/50" : "opacity-60"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">{m.company?.name ?? "Empresa"}</p>
                    <p className="text-xs text-muted-foreground capitalize">{m.role} · {m.company?.status}</p>
                  </div>
                </div>
                {allowed ? (
                  <Button onClick={() => choose(m.company_id, m.company?.status)} className="gradient-primary text-primary-foreground">
                    Entrar
                  </Button>
                ) : (
                  <Button disabled variant="outline">
                    <Lock className="w-4 h-4 mr-2" /> Bloqueada
                  </Button>
                )}
              </Card>
            );
          })}
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
