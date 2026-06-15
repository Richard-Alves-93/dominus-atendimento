import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogOut, ShieldAlert } from "lucide-react";
import { blockedReason } from "@/lib/companyStatus";

export default function EmpresaBloqueada() {
  const navigate = useNavigate();
  const { memberships, signOut } = useAuth();
  const { activeCompanyId, setActiveCompanyId } = useCompany();

  const active = memberships.find((m) => m.company_id === activeCompanyId) ?? memberships[0] ?? null;
  const status = active?.company?.status;

  const handleSignOut = async () => {
    setActiveCompanyId(null);
    await signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-8 text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-7 h-7 text-destructive" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Acesso bloqueado</h1>
          <p className="text-muted-foreground">{blockedReason(status)}</p>
          {active?.company?.name && (
            <p className="text-sm text-muted-foreground">
              Empresa: <span className="font-medium text-foreground">{active.company.name}</span>
            </p>
          )}
        </div>
        <Button variant="outline" className="w-full" onClick={handleSignOut}>
          <LogOut className="w-4 h-4 mr-2" /> Sair
        </Button>
      </Card>
    </div>
  );
}
