import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Loader2 } from "lucide-react";

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
    if (memberships.length === 1) return <Navigate to="/app" replace />;
    if (memberships.length > 1) return <Navigate to="/selecionar-empresa" replace />;
  }
  return <>{children}</>;
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, memberships, loading } = useAuth();
  const { activeCompanyId } = useCompany();
  const location = useLocation();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/auth" replace state={{ from: location }} />;
  if (memberships.length === 0) return <Navigate to="/auth" replace />;
  if (memberships.length > 1 && !activeCompanyId) return <Navigate to="/selecionar-empresa" replace />;
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
