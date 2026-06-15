import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Search,
  Send,
  Phone,
  MoreVertical,
  Check,
  CheckCheck,
  MessageSquare,
  Loader2,
  Users,
  UserPlus,
  Building2,
  CheckCircle2,
  Clock,
  RotateCcw,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

type TicketStatus = "open" | "pending" | "closed";
type ListFilter = "todos" | "fila" | "meus" | "open" | "pending" | "closed";

interface TicketRow {
  id: string;
  company_id: string;
  contact_id: string;
  channel_id: string | null;
  status: TicketStatus;
  unread_count: number;
  last_message_at: string | null;
  subject: string | null;
  department_id: string | null;
  assigned_user_id: string | null;
  contact: { id: string; name: string | null; phone_number: string | null; avatar_url: string | null } | null;
  department: { id: string; name: string } | null;
  assignee?: { id: string; full_name: string | null; email: string | null } | null;
}

interface MessageRow {
  id: string;
  ticket_id: string;
  direction: "inbound" | "outbound";
  from_me: boolean;
  body: string | null;
  msg_type: string;
  status: string | null;
  sent_at: string;
  created_at: string;
}

interface DeptRow { id: string; name: string; status: string }
interface UserOption { user_id: string; full_name: string | null; email: string | null }

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Aberto",
  pending: "Pendente",
  closed: "Fechado",
};

function initialsOf(name?: string | null, phone?: string | null) {
  const s = (name || phone || "?").trim();
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

function fmtTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Ontem";
  return d.toLocaleDateString();
}

const Tickets = () => {
  const qc = useQueryClient();
  const { activeCompanyId, activeMembership } = useCompany();
  const { profile } = useAuth();
  const isMaster = profile?.is_master === true || profile?.global_role === "master";
  const role = activeMembership?.role;
  const isAdmin = isMaster || role === "owner" || role === "admin";
  const isManager = role === "manager";
  const canManageTicket = isAdmin || isManager;

  const [filter, setFilter] = useState<ListFilter>("todos");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [assignDeptOpen, setAssignDeptOpen] = useState(false);
  const [assignUserOpen, setAssignUserOpen] = useState(false);
  const [pendingDeptId, setPendingDeptId] = useState<string>("");
  const [pendingUserId, setPendingUserId] = useState<string>("");
  const endRef = useRef<HTMLDivElement>(null);

  // Departments of company
  const deptsQuery = useQuery({
    queryKey: ["company-depts", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("departments")
        .select("id, name, status")
        .eq("company_id", activeCompanyId!)
        .is("deleted_at", null)
        .order("name");
      return (data ?? []) as DeptRow[];
    },
  });
  const activeDepts = (deptsQuery.data ?? []).filter((d) => d.status === "active");

  // My departments (non-admin)
  const myDeptsQuery = useQuery({
    queryKey: ["my-depts", activeCompanyId, profile?.id],
    enabled: !!activeCompanyId && !!profile?.id && !isAdmin,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("department_users")
        .select("department_id, role")
        .eq("company_id", activeCompanyId!)
        .eq("user_id", profile!.id)
        .eq("status", "active");
      return (data ?? []) as { department_id: string; role: string }[];
    },
  });
  const myDeptIds = (myDeptsQuery.data ?? []).map((d) => d.department_id);
  const myManagedDeptIds = (myDeptsQuery.data ?? []).filter((d) => d.role === "manager").map((d) => d.department_id);

  const ticketsQuery = useQuery({
    queryKey: ["tickets", activeCompanyId, filter, deptFilter, profile?.id, isAdmin, myDeptIds.join(",")],
    enabled: !!activeCompanyId && (isAdmin || myDeptsQuery.isFetched || !profile?.id),
    refetchInterval: 5000,
    queryFn: async () => {
      let q = (supabase as any)
        .from("tickets")
        .select(
          "id, company_id, contact_id, channel_id, status, unread_count, last_message_at, subject, department_id, assigned_user_id, contact:contacts(id, name, phone_number, avatar_url), department:departments(id, name)",
        )
        .eq("company_id", activeCompanyId!)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(200);

      // status filter
      if (filter === "open" || filter === "pending" || filter === "closed") {
        q = q.eq("status", filter);
      } else if (filter === "fila") {
        q = q.is("department_id", null).is("assigned_user_id", null).neq("status", "closed");
      } else if (filter === "meus" && profile?.id) {
        q = q.eq("assigned_user_id", profile.id).neq("status", "closed");
      } else {
        // todos: hide closed by default
        q = q.neq("status", "closed");
      }

      if (deptFilter !== "all") {
        q = q.eq("department_id", deptFilter);
      }

      if (!isAdmin && profile?.id) {
        const parts: string[] = [`assigned_user_id.eq.${profile.id}`, `department_id.is.null`];
        if (myDeptIds.length > 0) parts.push(`department_id.in.(${myDeptIds.join(",")})`);
        q = q.or(parts.join(","));
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as TicketRow[];
    },
  });

  // Fetch assignee profiles separately (FK is to auth.users, not embeddable into profiles)
  const assigneeIds = useMemo(() => {
    const set = new Set<string>();
    (ticketsQuery.data ?? []).forEach((t) => { if (t.assigned_user_id) set.add(t.assigned_user_id); });
    return Array.from(set);
  }, [ticketsQuery.data]);

  const assigneeProfilesQuery = useQuery({
    queryKey: ["assignee-profiles", assigneeIds.join(",")],
    enabled: assigneeIds.length > 0,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("profiles").select("id, full_name, email").in("id", assigneeIds);
      const map: Record<string, { id: string; full_name: string | null; email: string | null }> = {};
      (data ?? []).forEach((p: any) => { map[p.id] = p; });
      return map;
    },
  });

  const tickets = useMemo(() => {
    const list = ticketsQuery.data ?? [];
    const pmap = assigneeProfilesQuery.data ?? {};
    const withAssignee = list.map((t) => ({
      ...t,
      assignee: t.assigned_user_id ? pmap[t.assigned_user_id] ?? null : null,
    }));
    if (!search.trim()) return withAssignee;
    const s = search.toLowerCase();
    return withAssignee.filter(
      (t) =>
        (t.contact?.name || "").toLowerCase().includes(s) ||
        (t.contact?.phone_number || "").includes(s),
    );
  }, [ticketsQuery.data, assigneeProfilesQuery.data, search]);

  const selected = useMemo(
    () => tickets.find((t) => t.id === selectedId) ?? null,
    [tickets, selectedId],
  );

  useEffect(() => {
    if (!selectedId && tickets.length > 0) setSelectedId(tickets[0].id);
  }, [tickets, selectedId]);

  // Permission to manage current selected ticket
  const canEditSelected = useMemo(() => {
    if (!selected) return false;
    if (isAdmin) return true;
    if (isManager) {
      if (!selected.department_id) return true;
      return myManagedDeptIds.includes(selected.department_id);
    }
    return false;
  }, [selected, isAdmin, isManager, myManagedDeptIds]);

  // Users for assignment (filtered by selected ticket's department)
  const assignableUsersQuery = useQuery({
    queryKey: ["assignable-users", activeCompanyId, selected?.department_id],
    enabled: !!activeCompanyId && assignUserOpen,
    queryFn: async () => {
      if (selected?.department_id) {
        const { data } = await (supabase as any)
          .from("department_users")
          .select("user_id, profile:profiles(id, full_name, email)")
          .eq("company_id", activeCompanyId!)
          .eq("department_id", selected.department_id)
          .eq("status", "active");
        return ((data ?? []) as any[]).map((r) => ({
          user_id: r.user_id,
          full_name: r.profile?.full_name ?? null,
          email: r.profile?.email ?? null,
        })) as UserOption[];
      }
      const { data } = await (supabase as any)
        .from("company_users")
        .select("user_id, profile:profiles(id, full_name, email)")
        .eq("company_id", activeCompanyId!)
        .eq("status", "active");
      return ((data ?? []) as any[]).map((r) => ({
        user_id: r.user_id,
        full_name: r.profile?.full_name ?? null,
        email: r.profile?.email ?? null,
      })) as UserOption[];
    },
  });

  // Zero unread on open
  useEffect(() => {
    if (!selected || (selected.unread_count ?? 0) === 0) return;
    (supabase as any)
      .from("tickets")
      .update({ unread_count: 0 })
      .eq("id", selected.id)
      .then(() => {
        qc.invalidateQueries({ queryKey: ["tickets", activeCompanyId] });
      });
  }, [selected?.id]);

  const messagesQuery = useQuery({
    queryKey: ["messages", selectedId],
    enabled: !!selectedId,
    refetchInterval: 4000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, ticket_id, direction, from_me, body, msg_type, status, sent_at, created_at")
        .eq("ticket_id", selectedId!)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as MessageRow[];
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesQuery.data?.length, selectedId]);

  const sendMutation = useMutation({
    mutationFn: async (body: string) => {
      if (!activeCompanyId || !selected) throw new Error("Selecione um ticket");
      const { data, error } = await supabase.functions.invoke("send-whatsapp-message", {
        body: { company_id: activeCompanyId, ticket_id: selected.id, text: body },
      });
      if (error) throw error;
      const d = data as any;
      if (d?.ok === false || d?.error) {
        const detail = d?.detail ? ` — ${d.detail}` : "";
        throw new Error(`[${d?.step ?? "erro"}] ${d?.error ?? "Falha"}${detail}`);
      }
      return data;
    },
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["messages", selectedId] });
      qc.invalidateQueries({ queryKey: ["tickets", activeCompanyId] });
    },
    onError: (e: Error) => {
      toast({ title: "Falha ao enviar", description: e.message, variant: "destructive" });
    },
  });

  const handleSend = () => {
    const v = text.trim();
    if (!v || sendMutation.isPending) return;
    sendMutation.mutate(v);
  };

  const updateTicket = async (patch: Record<string, any>, successMsg: string) => {
    if (!selected) return;
    const { error } = await (supabase as any).from("tickets").update(patch).eq("id", selected.id);
    if (error) {
      toast({ title: "Falha ao atualizar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: successMsg });
    qc.invalidateQueries({ queryKey: ["tickets", activeCompanyId] });
  };

  const changeStatus = (status: TicketStatus) =>
    updateTicket({ status }, `Atendimento marcado como ${STATUS_LABEL[status].toLowerCase()}.`);

  const saveDepartment = async () => {
    if (!pendingDeptId) return;
    await updateTicket(
      { department_id: pendingDeptId, assigned_at: new Date().toISOString(), assigned_by: profile?.id ?? null },
      "Setor definido.",
    );
    setAssignDeptOpen(false);
    setPendingDeptId("");
  };

  const saveAssignee = async () => {
    if (!pendingUserId) return;
    await updateTicket(
      { assigned_user_id: pendingUserId, assigned_at: new Date().toISOString(), assigned_by: profile?.id ?? null },
      "Responsável atribuído.",
    );
    setAssignUserOpen(false);
    setPendingUserId("");
  };

  return (
    <AppLayout title="Atendimentos">
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* List */}
        <div className="w-80 border-r flex flex-col bg-card flex-shrink-0">
          <div className="p-3 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar atendimentos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 bg-secondary border-0"
              />
            </div>

            <Select value={filter} onValueChange={(v) => setFilter(v as ListFilter)}>
              <SelectTrigger className="h-9 bg-secondary border-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="fila">Fila geral</SelectItem>
                <SelectItem value="meus">Meus atendimentos</SelectItem>
                <SelectItem value="open">Abertos</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="closed">Fechados</SelectItem>
              </SelectContent>
            </Select>

            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="h-9 bg-secondary border-0">
                <SelectValue placeholder="Setor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os setores</SelectItem>
                {activeDepts.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {ticketsQuery.isLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Carregando...
              </div>
            ) : ticketsQuery.isError ? (
              <div className="px-4 py-6 text-sm text-destructive">Erro ao carregar atendimentos</div>
            ) : tickets.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground text-center">
                Nenhum atendimento encontrado
              </div>
            ) : (
              tickets.map((t) => {
                const name = t.contact?.name || t.contact?.phone_number || "Sem nome";
                const isFila = !t.department_id && !t.assigned_user_id;
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className={`flex items-start gap-3 px-3 py-3 cursor-pointer border-b transition-colors hover:bg-secondary/50 ${selectedId === t.id ? "bg-secondary" : ""}`}
                  >
                    <Avatar className="h-10 w-10 flex-shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                        {initialsOf(t.contact?.name, t.contact?.phone_number)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm text-foreground truncate">{name}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {fmtTime(t.last_message_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        {isFila && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-primary/30 text-primary">
                            Fila geral
                          </Badge>
                        )}
                        {t.department?.name && (
                          <span className="text-[10px] text-muted-foreground truncate">{t.department.name}</span>
                        )}
                        <span className="text-[10px] text-muted-foreground">· {STATUS_LABEL[t.status]}</span>
                      </div>
                    </div>
                    {t.unread_count > 0 && (
                      <Badge className="gradient-primary text-primary-foreground text-[10px] h-5 min-w-5 flex items-center justify-center rounded-full px-1.5">
                        {t.unread_count}
                      </Badge>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Chat */}
        {selected ? (
          <div className="flex-1 flex flex-col min-w-0">
            <div className="h-auto py-2 flex items-center justify-between px-4 border-b bg-card gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {initialsOf(selected.contact?.name, selected.contact?.phone_number)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">
                    {selected.contact?.name || selected.contact?.phone_number || "Sem nome"}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <span>{selected.contact?.phone_number || "—"}</span>
                    <span>·</span>
                    <span>Setor: {selected.department?.name ?? "Fila geral"}</span>
                    <span>·</span>
                    <span>
                      Responsável:{" "}
                      {selected.assignee?.full_name || selected.assignee?.email || "Sem responsável"}
                    </span>
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                      {STATUS_LABEL[selected.status]}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button variant="ghost" size="icon" className="text-muted-foreground h-8 w-8">
                  <Phone className="w-4 h-4" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-muted-foreground h-8 w-8">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Status</DropdownMenuLabel>
                    {selected.status !== "open" && (
                      <DropdownMenuItem onClick={() => changeStatus("open")} disabled={!canEditSelected}>
                        <RotateCcw className="w-4 h-4 mr-2" /> Reabrir atendimento
                      </DropdownMenuItem>
                    )}
                    {selected.status !== "pending" && (
                      <DropdownMenuItem onClick={() => changeStatus("pending")} disabled={!canEditSelected}>
                        <Clock className="w-4 h-4 mr-2" /> Marcar como pendente
                      </DropdownMenuItem>
                    )}
                    {selected.status !== "closed" && (
                      <DropdownMenuItem onClick={() => changeStatus("closed")} disabled={!canEditSelected}>
                        <CheckCircle2 className="w-4 h-4 mr-2" /> Fechar atendimento
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Encaminhamento</DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() => {
                        setPendingDeptId(selected.department_id ?? "");
                        setAssignDeptOpen(true);
                      }}
                      disabled={!canEditSelected}
                    >
                      <Building2 className="w-4 h-4 mr-2" /> Definir setor
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setPendingUserId(selected.assigned_user_id ?? "");
                        setAssignUserOpen(true);
                      }}
                      disabled={!canEditSelected}
                    >
                      <UserPlus className="w-4 h-4 mr-2" /> Atribuir atendente
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-secondary/30 scrollbar-thin">
              {messagesQuery.isLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Carregando mensagens...
                </div>
              ) : (messagesQuery.data ?? []).length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">
                  Nenhuma mensagem ainda
                </div>
              ) : (
                (messagesQuery.data ?? []).map((m) => (
                  <div key={m.id} className={`flex ${m.from_me ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                        m.from_me
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-card text-foreground shadow-card rounded-bl-md"
                      }`}
                    >
                      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                        {m.body || <span className="italic opacity-70">[{m.msg_type}]</span>}
                      </p>
                      <div
                        className={`flex items-center justify-end gap-1 mt-1 ${m.from_me ? "text-primary-foreground/60" : "text-muted-foreground"}`}
                      >
                        <span className="text-[10px]">{fmtTime(m.sent_at || m.created_at)}</span>
                        {m.from_me &&
                          (m.status === "read" ? (
                            <CheckCheck className="w-3.5 h-3.5" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={endRef} />
            </div>

            <div className="p-3 border-t bg-card">
              {selected.status === "closed" ? (
                <div className="text-center text-sm text-muted-foreground py-2">
                  Este atendimento está fechado. Reabra para enviar mensagens.
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Digite uma mensagem..."
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    className="flex-1 h-10 bg-secondary border-0 rounded-full px-4"
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!text.trim() || sendMutation.isPending}
                    size="icon"
                    className="gradient-primary text-primary-foreground h-10 w-10 rounded-full flex-shrink-0"
                  >
                    {sendMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-secondary/20">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">Selecione uma conversa</p>
            </div>
          </div>
        )}
      </div>

      {/* Dialog: Definir setor */}
      <Dialog open={assignDeptOpen} onOpenChange={setAssignDeptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Definir setor</DialogTitle>
            <DialogDescription>Escolha o setor responsável por este atendimento.</DialogDescription>
          </DialogHeader>
          <Select value={pendingDeptId} onValueChange={setPendingDeptId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um setor" />
            </SelectTrigger>
            <SelectContent>
              {activeDepts.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignDeptOpen(false)}>Cancelar</Button>
            <Button onClick={saveDepartment} disabled={!pendingDeptId}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Atribuir atendente */}
      <Dialog open={assignUserOpen} onOpenChange={setAssignUserOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atribuir atendente</DialogTitle>
            <DialogDescription>
              {selected?.department_id
                ? "Apenas atendentes do setor são listados."
                : "Defina um setor primeiro para filtrar atendentes (opcional)."}
            </DialogDescription>
          </DialogHeader>
          {assignableUsersQuery.isLoading ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Carregando...
            </div>
          ) : (
            <Select value={pendingUserId} onValueChange={setPendingUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um atendente" />
              </SelectTrigger>
              <SelectContent>
                {(assignableUsersQuery.data ?? []).map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    {u.full_name || u.email || u.user_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignUserOpen(false)}>Cancelar</Button>
            <Button onClick={saveAssignee} disabled={!pendingUserId}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Tickets;
