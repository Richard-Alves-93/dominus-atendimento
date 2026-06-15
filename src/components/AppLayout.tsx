import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Bell, Building2, ShieldAlert, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useNavigate } from "react-router-dom";

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function AppLayout({ children, title }: AppLayoutProps) {
  const { profile } = useAuth();
  const { activeMembership, isImpersonating, impersonatedCompanyName, stopImpersonation } = useCompany();
  const navigate = useNavigate();
  const isMaster = profile?.is_master === true || profile?.global_role === "master";
  const initials = (profile?.full_name ?? profile?.email ?? "U")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const goMaster = () => {
    stopImpersonation();
    navigate("/master");
  };

  const displayCompanyName = isImpersonating
    ? impersonatedCompanyName
    : activeMembership?.company?.name;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {isImpersonating && (
            <div className="flex items-center gap-2 px-4 py-2 bg-warning/10 border-b border-warning/20 text-warning text-sm">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span className="flex-1 truncate">
                Você está acessando a empresa <strong>{impersonatedCompanyName}</strong> como Master.
                {activeMembership?.company?.status && activeMembership.company.status !== "active" && activeMembership.company.status !== "trial" && (
                  <> Esta empresa está <strong>{activeMembership.company.status}</strong>.</>
                )}
              </span>
            </div>
          )}
          <header className="h-14 flex items-center justify-between border-b bg-card px-4">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              {title && <h1 className="text-lg font-semibold text-foreground">{title}</h1>}
            </div>
            <div className="flex items-center gap-3">
              {displayCompanyName && (
                <div className="hidden md:flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Building2 className="w-4 h-4" />
                  <span className="font-medium text-foreground">{displayCompanyName}</span>
                </div>
              )}
              {isMaster && (
                <Button variant="outline" size="sm" onClick={goMaster}>
                  <Shield className="w-4 h-4 mr-1.5" /> Área Master
                </Button>
              )}
              <Button variant="ghost" size="icon" className="relative text-muted-foreground">
                <Bell className="h-4 w-4" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
              </Button>
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">{initials}</AvatarFallback>
              </Avatar>
            </div>
          </header>
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
