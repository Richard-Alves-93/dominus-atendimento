import { Navigate, useLocation } from "react-router-dom";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Loader2 } from "lucide-react";
import { isCompanyAllowed } from "@/lib/companyStatus";
import { toast } from "sonner";

function RoleBlocked() {
  useEffect(() => {
    toast.error("Você não tem permissão para acessar esta área.");
  }, []);
  return <Navigate to="/app/dashboard" replace />;
}

function FullPageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

export function PublicRoute({ children }: { children: ReactNode }) {
  const { user, profile, memberships, loading } = useAuth();
  const isMaster = profile?.is_master === true || profile?.global_role === "master";
  if (loading) return <FullPageLoader />;
  if (user) {
    if (isMaster) return <Navigate to="/master" replace />;
    const allowed = memberships.filter((m) => isCompanyAllowed(m.company?.status));
    if (memberships.length > 0 && allowed.length === 0) return <Navigate to="/empresa-bloqueada" replace />;
    if (allowed.length === 1) return <Navigate to="/app" replace />;
    if (allowed.length > 1) return <Navigate to="/selecionar-empresa" replace />;
  }
  return <>{children}</>;
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, profile, memberships, loading } = useAuth();
  const { activeCompanyId, isImpersonating } = useCompany();
  const location = useLocation();
  const isMaster = profile?.is_master === true || profile?.global_role === "master";
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/auth" replace state={{ from: location }} />;
  if (profile?.must_change_password && location.pathname !== "/trocar-senha") {
    return <Navigate to="/trocar-senha" replace />;
  }
  if (isMaster) {
    if (!activeCompanyId) return <Navigate to="/master" replace />;
    // Master can access suspended companies (impersonation/internal) - banner shown
    return <>{children}</>;
  }
  if (memberships.length === 0) return <Navigate to="/auth" replace />;
  const allowed = memberships.filter((m) => isCompanyAllowed(m.company?.status));
  if (allowed.length === 0) return <Navigate to="/empresa-bloqueada" replace />;
  if (allowed.length > 1 && !activeCompanyId) return <Navigate to="/selecionar-empresa" replace />;
  const active = memberships.find((m) => m.company_id === activeCompanyId) ?? allowed[0];
  if (!isCompanyAllowed(active.company?.status)) return <Navigate to="/empresa-bloqueada" replace />;
  // Role-based page guard for /app/equipe and /app/setores
  if ((location.pathname === "/app/equipe" || location.pathname === "/app/setores") &&
      !["owner","admin","manager"].includes(active.role)) {
    return <RoleBlocked />;
  }
  return <>{children}</>;
}

export function MasterRoute({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth();
  const isMaster = profile?.is_master === true || profile?.global_role === "master";
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isMaster) return <Navigate to="/app" replace />;
  return <>{children}</>;
}
