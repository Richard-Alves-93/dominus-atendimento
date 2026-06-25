import {
  LayoutDashboard,
  MessageSquare,
  MessageSquareText,
  Users,
  Send,
  Settings,
  Phone,
  Tag,
  CalendarDays,
  LogOut,
  Zap,
  Building,
  UsersRound,
  UserCircle,
  Briefcase,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";

const mainItems = [
  { title: "Painel", url: "/app/dashboard", icon: LayoutDashboard },
  { title: "Atendimentos", url: "/app/tickets", icon: MessageSquare },
  { title: "Contatos", url: "/app/contatos", icon: Users },
  { title: "Mensagens Rápidas", url: "/app/mensagens-rapidas", icon: MessageSquareText },
  { title: "Oportunidades", url: "/app/oportunidades", icon: Briefcase },
  { title: "Campanhas", url: "/app/campanhas", icon: Send, adminOnly: true },
  { title: "Agendamentos", url: "/app/agendamentos", icon: CalendarDays, adminOnly: true },
];

const configItems = [
  { title: "Conexões", url: "/app/conexoes", icon: Phone, adminOnly: true },
  { title: "Setores", url: "/app/setores", icon: Building, adminOnly: true },
  { title: "Equipe", url: "/app/equipe", icon: UsersRound, adminOnly: true },
  { title: "Tags", url: "/app/tags", icon: Tag, adminOnly: true },
  { title: "Configurações", url: "/app/configuracoes", icon: Settings, adminOnly: true },
  { title: "Meu Perfil", url: "/app/perfil", icon: UserCircle },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, profile } = useAuth();
  const { activeMembership } = useCompany();
  const isMaster = profile?.is_master === true || profile?.global_role === "master";
  const role = activeMembership?.role;
  const canAdmin = isMaster || role === "owner" || role === "admin" || role === "manager";
  const filterByRole = <T extends { adminOnly?: boolean }>(items: T[]) =>
    items.filter((i) => (i.adminOnly ? canAdmin : true));
  const isActive = (path: string) => location.pathname === path;

  const handleLogout = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="scrollbar-thin">
        <div className="flex items-center gap-2.5 px-4 py-5">
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="text-base font-bold text-sidebar-accent-foreground leading-tight">Dominus</span>
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
            {!collapsed && "Principal"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filterByRole(mainItems).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <NavLink to={item.url} end className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
            {!collapsed && "Configuração"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filterByRole(configItems).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <NavLink to={item.url} end className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} tooltip="Sair" className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              {!collapsed && <span>Sair</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
