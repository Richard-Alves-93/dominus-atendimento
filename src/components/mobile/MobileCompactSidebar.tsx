import {
  LayoutDashboard,
  MessageSquare,
  MessageSquareText,
  Users,
  Send,
  Phone,
  Building,
  UsersRound,
  CalendarDays,
  Tag,
  Settings,
  UserCircle,
  LogOut,
  Zap,
  Briefcase,
  Wallet,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";

// Sidebar compacta usada apenas no shell mobile (Fase D).
// Não substitui o AppSidebar desktop.

type Item = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
};

const items: Item[] = [
  { title: "Painel", url: "/app/dashboard", icon: LayoutDashboard },
  { title: "Atendimentos", url: "/app/tickets", icon: MessageSquare },
  { title: "Contatos", url: "/app/contatos", icon: Users },
  { title: "Mensagens Rápidas", url: "/app/mensagens-rapidas", icon: MessageSquareText },
  { title: "Oportunidades", url: "/app/oportunidades", icon: Briefcase },
  { title: "Campanhas", url: "/app/campanhas", icon: Send, adminOnly: true },
  { title: "Agendamentos", url: "/app/agendamentos", icon: CalendarDays, adminOnly: true },
  { title: "Conexões", url: "/app/conexoes", icon: Phone, adminOnly: true },
  { title: "Setores", url: "/app/setores", icon: Building, adminOnly: true },
  { title: "Equipe", url: "/app/equipe", icon: UsersRound, adminOnly: true },
  { title: "Tags", url: "/app/tags", icon: Tag, adminOnly: true },
  { title: "Configurações", url: "/app/configuracoes", icon: Settings, adminOnly: true },
  { title: "Meu Perfil", url: "/app/perfil", icon: UserCircle },
];

export function MobileCompactSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { activeMembership } = useCompany();

  const isMaster = profile?.is_master === true || profile?.global_role === "master";
  const role = activeMembership?.role;
  const canAdmin = isMaster || role === "owner" || role === "admin" || role === "manager";

  const visible = items.filter((i) => (i.adminOnly ? canAdmin : true));

  const initials = (profile?.full_name ?? profile?.email ?? "U")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside
      className="shrink-0 w-14 h-svh flex flex-col items-center bg-sidebar text-sidebar-foreground border-r border-sidebar-border"
      aria-label="Navegação"
    >
      <div className="h-12 w-full flex items-center justify-center shrink-0">
        <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
          <Zap className="w-4 h-4 text-primary-foreground" />
        </div>
      </div>

      <nav className="flex-1 w-full flex flex-col items-center gap-1 py-2 overflow-y-auto scrollbar-thin">
        {visible.map((item) => {
          const active = location.pathname === item.url;
          const Icon = item.icon;
          return (
            <button
              key={item.url}
              onClick={() => navigate(item.url)}
              title={item.title}
              aria-label={item.title}
              aria-current={active ? "page" : undefined}
              className={`h-10 w-10 rounded-xl flex items-center justify-center transition ${
                active
                  ? "bg-success/20 text-success"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
              }`}
            >
              <Icon className="w-5 h-5" />
            </button>
          );
        })}
      </nav>

      <div className="w-full flex items-center justify-center py-2 shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary text-primary-foreground text-[11px] font-medium">
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>
    </aside>
  );
}
