import { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Building2, Package, Plug, ScrollText, Settings, LogOut, Zap } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const items = [
  { to: "/master", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/master/empresas", icon: Building2, label: "Empresas" },
  { to: "/master/planos", icon: Package, label: "Planos" },
  { to: "/master/canais", icon: Plug, label: "Canais" },
  { to: "/master/logs", icon: ScrollText, label: "Logs" },
  { to: "/master/configuracoes", icon: Settings, label: "Configurações" },
];

export function MasterLayout({ children, title }: { children: ReactNode; title?: string }) {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const initials = (profile?.full_name ?? profile?.email ?? "M").slice(0, 2).toUpperCase();

  const handleLogout = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-60 border-r bg-card flex flex-col">
        <div className="h-16 flex items-center gap-2 px-4 border-b">
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold">Dominus</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Master</div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm",
                  isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted",
                )
              }
            >
              <it.icon className="w-4 h-4" /> {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-2 border-t">
          <Button variant="ghost" className="w-full justify-start text-destructive" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" /> Sair
          </Button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b bg-card px-6 flex items-center justify-between">
          <h1 className="text-lg font-semibold">{title ?? "Master"}</h1>
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback>
          </Avatar>
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
