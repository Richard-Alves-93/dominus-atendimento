import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Columns3, Plus, Search, Loader2, MoreVertical, Trash2, ArrowRightLeft,
  User as UserIcon, Building, Briefcase, ListFilter, LinkIcon, ExternalLink,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type LaneType = "department" | "commercial" | "personal" | "custom";

const LANE_TYPE_LABEL: Record<LaneType, string> = {
  department: "Setor",
  commercial: "Comercial",
  personal: "Pessoal",
  custom: "Personalizada",
};

const LANE_TYPE_COLORS: Record<LaneType, string> = {
  department: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  commercial: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  personal: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  custom: "bg-muted text-muted-foreground border-border",
};

type Lane = {
  id: string;
  company_id: string;
  owner_user_id: string | null;
  name: string;
  lane_type: LaneType;
  department_id: string | null;
  is_personal: boolean;
  position: number;
  is_active: boolean;
};

type Column = {
  id: string;
  company_id: string;
  lane_id: string;
  name: string;
  position: number;
  color: string | null;
};

type CardRow = {
  id: string;
  company_id: string;
  lane_id: string;
  column_id: string;
  title: string;
  description: string | null;
  card_type: string;
  assigned_user_id: string | null;
  position: number;
  contact_id: string | null;
  ticket_id: string | null;
  opportunity_id: string | null;
};

type SideKind = "contact" | "ticket" | "opportunity";
type SideItem = {
  kind: SideKind;
  id: string;
  label: string;
  sub?: string;
  extra?: string;
};

const COLOR_PRESETS = [
  { v: "slate", l: "Cinza", hex: "#64748b" },
  { v: "blue", l: "Azul", hex: "#3b82f6" },
  { v: "emerald", l: "Verde", hex: "#10b981" },
  { v: "amber", l: "Amarelo", hex: "#f59e0b" },
  { v: "rose", l: "Rosa", hex: "#f43f5e" },
  { v: "purple", l: "Roxo", hex: "#a855f7" },
];

function colorHex(c?: string | null): string {
  const found = COLOR_PRESETS.find((p) => p.v === c);
  return found?.hex ?? "#94a3b8";
}

async function writeAudit(
  companyId: string,
  userId: string | null,
  action: string,
  metadata: Record<string, unknown>,
) {
  try {
    await (supabase as any).from("audit_logs").insert({
      company_id: companyId,
      user_id: userId,
      action,
      metadata: { ...metadata, source: "kanban" },
    });
  } catch {
    /* não bloquear UI por falha de auditoria */
  }
}

/**
 * Helper unificado para criar card vinculado (usado pelo botão "Adicionar ao Kanban"
 * e pelo drag-and-drop nativo). Aplica as mesmas validações de empresa, linha,
 * coluna, visibilidade de linha pessoal e duplicidade. Não executa nenhuma
 * automação operacional (não move setor, não muda responsável, não altera status,
 * não envia mensagem, não gera comissão).
 */
async function linkItemToColumn(args: {
  item: SideItem;
  companyId: string;
  userId: string;
  laneId: string;
  columnId: string;
  lanes: Lane[];
  columns: Column[];
  existingCards: CardRow[];
  canManageCompany: boolean;
  currentUserId: string | null;
  source: "kanban_sidebar" | "kanban_drag_drop";
  title?: string;
  description?: string | null;
}): Promise<
  | { status: "ok"; cardId: string }
  | { status: "duplicate" }
  | { status: "forbidden" }
  | { status: "invalid" }
  | { status: "error"; message: string }
> {
  const { item, companyId, userId, laneId, columnId, lanes, columns,
    existingCards, canManageCompany, currentUserId, source } = args;

  const lane = lanes.find((l) => l.id === laneId);
  const col = columns.find((c) => c.id === columnId);
  if (!lane || !col) return { status: "invalid" };
  if (lane.company_id !== companyId || col.company_id !== companyId) return { status: "invalid" };
  if (col.lane_id !== laneId) return { status: "invalid" };
  // Linha pessoal de outro usuário: não pode receber drop por usuário comum
  if (lane.is_personal && !canManageCompany && lane.owner_user_id !== currentUserId) {
    return { status: "forbidden" };
  }

  const dup = existingCards.find((c) =>
    c.column_id === columnId &&
    ((item.kind === "ticket" && c.ticket_id === item.id) ||
     (item.kind === "contact" && c.contact_id === item.id) ||
     (item.kind === "opportunity" && c.opportunity_id === item.id))
  );
  if (dup) return { status: "duplicate" };

  const position = existingCards.filter((c) => c.column_id === columnId).length;
  const payload: Record<string, unknown> = {
    company_id: companyId,
    lane_id: laneId,
    column_id: columnId,
    title: (args.title?.trim() || item.label || "Item").slice(0, 200),
    description: args.description?.trim() || null,
    card_type: item.kind,
    position,
    created_by: userId,
  };
  if (item.kind === "ticket") payload.ticket_id = item.id;
  if (item.kind === "contact") payload.contact_id = item.id;
  if (item.kind === "opportunity") payload.opportunity_id = item.id;

  const { data, error } = await (supabase as any)
    .from("kanban_cards")
    .insert(payload)
    .select("id")
    .single();
  if (error) return { status: "error", message: error.message };

  await writeAudit(companyId, userId, "kanban.card_linked", {
    card_id: data?.id,
    card_type: item.kind,
    ticket_id: item.kind === "ticket" ? item.id : null,
    contact_id: item.kind === "contact" ? item.id : null,
    opportunity_id: item.kind === "opportunity" ? item.id : null,
    lane_id: laneId,
    column_id: columnId,
    source,
  });

  return { status: "ok", cardId: data?.id };
}

const DRAG_MIME = "application/x-dominus-kanban-item";

export default function Kanban() {
  const { profile, user } = useAuth();
  const { activeMembership } = useCompany();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const companyId = activeMembership?.company_id ?? null;
  const isMaster = profile?.is_master === true || profile?.global_role === "master";
  const role = activeMembership?.role;
  const canManage = isMaster || role === "owner" || role === "admin" || role === "manager";

  /* ---------------- Queries ---------------- */
  const lanesQ = useQuery({
    queryKey: ["kanban-lanes", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<Lane[]> => {
      const { data, error } = await (supabase as any)
        .from("kanban_lanes")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Lane[];
    },
  });

  const columnsQ = useQuery({
    queryKey: ["kanban-columns", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<Column[]> => {
      const { data, error } = await (supabase as any)
        .from("kanban_columns")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Column[];
    },
  });

  const cardsQ = useQuery({
    queryKey: ["kanban-cards", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<CardRow[]> => {
      const { data, error } = await (supabase as any)
        .from("kanban_cards")
        .select("id,company_id,lane_id,column_id,title,description,card_type,assigned_user_id,position,contact_id,ticket_id,opportunity_id")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CardRow[];
    },
  });

  const departmentsQ = useQuery({
    queryKey: ["kanban-departments", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("departments")
        .select("id,name,is_active")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; is_active: boolean }[];
    },
  });

  // Sidebar leve: contatos recentes da empresa (apenas leitura segura)
  const contactsQ = useQuery({
    queryKey: ["kanban-sidebar-contacts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("contacts")
        .select("id,name,phone")
        .eq("company_id", companyId)
        .order("updated_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string | null; phone: string | null }[];
    },
  });

  const ticketsQ = useQuery({
    queryKey: ["kanban-sidebar-tickets", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tickets")
        .select("id,contact_id,status,department_id,assigned_user_id,updated_at,contact:contacts(name,phone),department:departments(name),assignee:profiles!tickets_assigned_user_id_fkey(full_name)")
        .eq("company_id", companyId)
        .in("status", ["open", "pending"])
        .order("updated_at", { ascending: false })
        .limit(40);
      if (error) {
        // Fallback simples se o alias de FK não casar
        const r = await (supabase as any)
          .from("tickets")
          .select("id,contact_id,status,department_id,assigned_user_id,updated_at,contact:contacts(name,phone),department:departments(name)")
          .eq("company_id", companyId)
          .in("status", ["open", "pending"])
          .order("updated_at", { ascending: false })
          .limit(40);
        if (r.error) throw r.error;
        return (r.data ?? []) as any[];
      }
      return (data ?? []) as any[];
    },
  });

  const opportunitiesQ = useQuery({
    queryKey: ["kanban-sidebar-opportunities", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("opportunities")
        .select("id,title,amount,status,assigned_user_id,contact_id,ticket_id,contact:contacts(name,phone)")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  /* ---------------- UI state ---------------- */
  const [sideTab, setSideTab] = useState<SideKind>("contact");
  const [sideSearch, setSideSearch] = useState("");
  const [laneFilter, setLaneFilter] = useState<"all" | LaneType>("all");

  const [laneDialog, setLaneDialog] = useState<{ open: boolean; lane?: Lane | null }>({ open: false });
  const [colDialog, setColDialog] = useState<{ open: boolean; laneId?: string }>({ open: false });
  const [cardDialog, setCardDialog] = useState<{ open: boolean; laneId?: string; columnId?: string }>({ open: false });
  const [linkDialog, setLinkDialog] = useState<{ open: boolean; item?: SideItem | null }>({ open: false });

  /* ---------------- Derived ---------------- */
  const lanes = (lanesQ.data ?? []).filter((l) => (laneFilter === "all" ? true : l.lane_type === laneFilter));
  const columnsByLane = useMemo(() => {
    const map: Record<string, Column[]> = {};
    for (const c of columnsQ.data ?? []) (map[c.lane_id] ||= []).push(c);
    return map;
  }, [columnsQ.data]);

  const cardsByColumn = useMemo(() => {
    const map: Record<string, CardRow[]> = {};
    for (const c of cardsQ.data ?? []) (map[c.column_id] ||= []).push(c);
    return map;
  }, [cardsQ.data]);

  /* ---------------- Card link enrichment ---------------- */
  const linkIds = useMemo(() => {
    const t = new Set<string>(), c = new Set<string>(), o = new Set<string>();
    for (const card of cardsQ.data ?? []) {
      if (card.ticket_id) t.add(card.ticket_id);
      if (card.contact_id) c.add(card.contact_id);
      if (card.opportunity_id) o.add(card.opportunity_id);
    }
    return { tickets: [...t], contacts: [...c], opportunities: [...o] };
  }, [cardsQ.data]);

  const linkEnrichQ = useQuery({
    queryKey: [
      "kanban-link-enrich",
      companyId,
      linkIds.tickets.join(","),
      linkIds.contacts.join(","),
      linkIds.opportunities.join(","),
    ],
    enabled: !!companyId,
    queryFn: async () => {
      const out: {
        contacts: Record<string, { name: string | null; phone: string | null }>;
        tickets: Record<string, { contact_name: string | null; department_name: string | null; status: string }>;
        opportunities: Record<string, { title: string; amount: number | null; status: string }>;
      } = { contacts: {}, tickets: {}, opportunities: {} };
      if (linkIds.contacts.length) {
        const { data } = await (supabase as any)
          .from("contacts")
          .select("id,name,phone")
          .eq("company_id", companyId)
          .in("id", linkIds.contacts);
        for (const r of data ?? []) out.contacts[r.id] = { name: r.name, phone: r.phone };
      }
      if (linkIds.tickets.length) {
        const { data } = await (supabase as any)
          .from("tickets")
          .select("id,status,contact:contacts(name,phone),department:departments(name)")
          .eq("company_id", companyId)
          .in("id", linkIds.tickets);
        for (const r of data ?? []) out.tickets[r.id] = {
          contact_name: r.contact?.name || r.contact?.phone || null,
          department_name: r.department?.name || null,
          status: r.status,
        };
      }
      if (linkIds.opportunities.length) {
        const { data } = await (supabase as any)
          .from("opportunities")
          .select("id,title,amount,status")
          .eq("company_id", companyId)
          .in("id", linkIds.opportunities);
        for (const r of data ?? []) out.opportunities[r.id] = {
          title: r.title, amount: r.amount, status: r.status,
        };
      }
      return out;
    },
  });
  const linkEnrich = linkEnrichQ.data ?? { contacts: {}, tickets: {}, opportunities: {} };

  /* ---------------- Sidebar items ---------------- */
  const sideItems: SideItem[] = useMemo(() => {
    const q = sideSearch.trim().toLowerCase();
    let items: SideItem[] = [];
    if (sideTab === "contact") {
      items = (contactsQ.data ?? []).map((c) => ({
        kind: "contact" as const,
        id: c.id,
        label: c.name || c.phone || "Sem nome",
        sub: c.phone || "",
      }));
    } else if (sideTab === "ticket") {
      items = (ticketsQ.data ?? []).map((t: any) => ({
        kind: "ticket" as const,
        id: t.id,
        label: t.contact?.name || t.contact?.phone || "Atendimento",
        sub: [t.department?.name, t.status === "open" ? "Aberto" : "Pendente"].filter(Boolean).join(" • "),
        extra: t.assignee?.full_name || undefined,
      }));
    } else {
      items = (opportunitiesQ.data ?? []).map((o: any) => ({
        kind: "opportunity" as const,
        id: o.id,
        label: o.title || "Oportunidade",
        sub: o.contact?.name || o.contact?.phone || "",
        extra: typeof o.amount === "number"
          ? `R$ ${Number(o.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
          : undefined,
      }));
    }
    if (!q) return items;
    return items.filter((i) =>
      i.label.toLowerCase().includes(q) ||
      (i.sub ?? "").toLowerCase().includes(q) ||
      (i.extra ?? "").toLowerCase().includes(q),
    );
  }, [sideTab, sideSearch, contactsQ.data, ticketsQ.data, opportunitiesQ.data]);

  /* ---------------- Loading ---------------- */
  if (!companyId) {
    return (
      <AppLayout>
        <div className="p-6 text-muted-foreground">Selecione uma empresa para usar o Kanban.</div>
      </AppLayout>
    );
  }

  const isLoading = lanesQ.isLoading || columnsQ.isLoading || cardsQ.isLoading;

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100svh-3.5rem)] md:h-[calc(100svh-2rem)] overflow-hidden">
        {/* Header */}
        <div className="flex flex-col gap-2 px-4 py-3 border-b bg-background/95 backdrop-blur md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Columns3 className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <h1 className="text-lg font-semibold leading-tight">Kanban</h1>
              <p className="text-xs text-muted-foreground truncate">
                Organize atendimentos, vendas, tarefas e fluxos pessoais em um único quadro.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={laneFilter} onValueChange={(v) => setLaneFilter(v as any)}>
              <SelectTrigger className="h-9 w-[160px]">
                <ListFilter className="h-4 w-4 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as linhas</SelectItem>
                <SelectItem value="department">Setor</SelectItem>
                <SelectItem value="commercial">Comercial</SelectItem>
                <SelectItem value="personal">Pessoal</SelectItem>
                <SelectItem value="custom">Personalizada</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => setLaneDialog({ open: true, lane: null })}>
              <Plus className="h-4 w-4 mr-1" /> Nova linha
            </Button>
          </div>
        </div>

        {/* Body: sidebar + board */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Sidebar */}
          <aside className="hidden md:flex w-72 shrink-0 border-r flex-col bg-card/30">
            <div className="p-3 border-b">
              <h2 className="text-sm font-semibold mb-2">Itens do quadro</h2>
              <div className="flex gap-1 mb-2">
                <Button
                  size="sm"
                  variant={sideTab === "contact" ? "default" : "outline"}
                  className="h-7 flex-1 px-1 text-[11px]"
                  onClick={() => setSideTab("contact")}
                >
                  Contatos
                </Button>
                <Button
                  size="sm"
                  variant={sideTab === "ticket" ? "default" : "outline"}
                  className="h-7 flex-1 px-1 text-[11px]"
                  onClick={() => setSideTab("ticket")}
                >
                  Atendimentos
                </Button>
                <Button
                  size="sm"
                  variant={sideTab === "opportunity" ? "default" : "outline"}
                  className="h-7 flex-1 px-1 text-[11px]"
                  onClick={() => setSideTab("opportunity")}
                >
                  Oportun.
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={sideSearch}
                  onChange={(e) => setSideSearch(e.target.value)}
                  placeholder="Buscar..."
                  className="pl-7 h-8 text-sm"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1">
              {sideItems.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 text-center">
                  Nenhum item encontrado.
                </p>
              ) : (
                sideItems.map((it) => (
                  <div
                    key={`${it.kind}-${it.id}`}
                    draggable
                    onDragStart={(e) => {
                      try {
                        const payload = JSON.stringify({ kind: it.kind, id: it.id, label: it.label });
                        e.dataTransfer.setData(DRAG_MIME, payload);
                        e.dataTransfer.setData("text/plain", it.label);
                        e.dataTransfer.effectAllowed = "copy";
                      } catch { /* ignore */ }
                    }}
                    className="rounded-md border bg-card px-2 py-1.5 text-xs hover:bg-accent group flex items-start gap-1 cursor-grab active:cursor-grabbing"
                    title="Arraste para uma coluna do Kanban ou use o botão"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{it.label}</div>
                      {it.sub && <div className="text-muted-foreground truncate">{it.sub}</div>}
                      {it.extra && <div className="text-[10px] text-muted-foreground truncate">{it.extra}</div>}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 shrink-0 opacity-60 group-hover:opacity-100"
                      title="Adicionar ao Kanban"
                      onClick={() => setLinkDialog({ open: true, item: it })}
                    >
                      <LinkIcon className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
            <div className="p-2 border-t text-[10px] text-muted-foreground">
              Vínculo apenas organizacional — não altera o item original.
            </div>
          </aside>

          {/* Board */}
          <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
              </div>
            ) : lanes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <Columns3 className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground mb-3">
                  Nenhuma linha criada ainda. Crie a primeira linha para começar.
                </p>
                <Button size="sm" onClick={() => setLaneDialog({ open: true, lane: null })}>
                  <Plus className="h-4 w-4 mr-1" /> Nova linha
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-4 p-3 md:p-4">
                {lanes.map((lane) => (
                  <LaneRow
                    key={lane.id}
                    lane={lane}
                    columns={(columnsByLane[lane.id] ?? []).sort((a, b) => a.position - b.position)}
                    cardsByColumn={cardsByColumn}
                    linkEnrich={linkEnrich}
                    onOpenLinked={(card) => {
                      if (card.ticket_id) {
                        try { sessionStorage.setItem("dominus.openTicketId", card.ticket_id); } catch { /* ignore */ }
                        navigate("/app/tickets");
                      } else if (card.opportunity_id) {
                        navigate("/app/oportunidades");
                      } else if (card.contact_id) {
                        navigate("/app/contatos");
                      }
                    }}
                    canManage={canManage || (lane.is_personal && lane.owner_user_id === user?.id)}
                    onAddColumn={() => setColDialog({ open: true, laneId: lane.id })}
                    onAddCard={(columnId) => setCardDialog({ open: true, laneId: lane.id, columnId })}
                    onEditLane={() => setLaneDialog({ open: true, lane })}
                    onDeleteLane={async () => {
                      if (!confirm(`Ocultar a linha "${lane.name}"? Esta ação pode ser revertida pelo banco.`)) return;
                      const { error } = await (supabase as any)
                        .from("kanban_lanes")
                        .update({ deleted_at: new Date().toISOString(), is_active: false })
                        .eq("id", lane.id);
                      if (error) {
                        toast({ title: "Erro", description: error.message, variant: "destructive" });
                        return;
                      }
                      qc.invalidateQueries({ queryKey: ["kanban-lanes", companyId] });
                    }}
                    onMoveCard={async (cardId, newColumnId) => {
                      const card = (cardsQ.data ?? []).find((c) => c.id === cardId);
                      if (!card) return;
                      const { error } = await (supabase as any)
                        .from("kanban_cards")
                        .update({ column_id: newColumnId })
                        .eq("id", cardId);
                      if (error) {
                        toast({ title: "Erro ao mover", description: error.message, variant: "destructive" });
                        return;
                      }
                      await writeAudit(companyId, user?.id ?? null, "kanban.card_moved", {
                        card_id: cardId, old_column_id: card.column_id, new_column_id: newColumnId,
                        card_type: card.card_type,
                      });
                      qc.invalidateQueries({ queryKey: ["kanban-cards", companyId] });
                    }}
                    onDeleteCard={async (cardId) => {
                      if (!confirm("Remover este card?")) return;
                      const { error } = await (supabase as any)
                        .from("kanban_cards")
                        .update({ deleted_at: new Date().toISOString() })
                        .eq("id", cardId);
                      if (error) {
                        toast({ title: "Erro", description: error.message, variant: "destructive" });
                        return;
                      }
                      qc.invalidateQueries({ queryKey: ["kanban-cards", companyId] });
                    }}
                    onDropItem={async (columnId, item) => {
                      if (!companyId || !user?.id) return;
                      const res = await linkItemToColumn({
                        item,
                        companyId,
                        userId: user.id,
                        laneId: lane.id,
                        columnId,
                        lanes: lanesQ.data ?? [],
                        columns: columnsQ.data ?? [],
                        existingCards: cardsQ.data ?? [],
                        canManageCompany: canManage,
                        currentUserId: user.id,
                        source: "kanban_drag_drop",
                      });
                      if (res.status === "ok") {
                        toast({ title: "Adicionado ao Kanban" });
                        qc.invalidateQueries({ queryKey: ["kanban-cards", companyId] });
                      } else if (res.status === "duplicate") {
                        toast({ title: "Este item já está nesta coluna do Kanban." });
                      } else if (res.status === "forbidden") {
                        toast({ title: "Você não pode soltar nesta linha.", variant: "destructive" });
                      } else if (res.status === "invalid") {
                        toast({ title: "Destino inválido.", variant: "destructive" });
                      } else {
                        toast({ title: "Erro ao adicionar", description: res.message, variant: "destructive" });
                      }
                    }}
                  />

                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <LaneDialog
        open={laneDialog.open}
        lane={laneDialog.lane ?? null}
        departments={departmentsQ.data ?? []}
        companyId={companyId}
        userId={user?.id ?? null}
        canManageCompany={canManage}
        onClose={() => setLaneDialog({ open: false })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["kanban-lanes", companyId] });
          setLaneDialog({ open: false });
        }}
      />

      <ColumnDialog
        open={colDialog.open}
        laneId={colDialog.laneId ?? null}
        companyId={companyId}
        userId={user?.id ?? null}
        existingCount={
          colDialog.laneId ? (columnsByLane[colDialog.laneId]?.length ?? 0) : 0
        }
        onClose={() => setColDialog({ open: false })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["kanban-columns", companyId] });
          setColDialog({ open: false });
        }}
      />

      <CardDialog
        open={cardDialog.open}
        laneId={cardDialog.laneId ?? null}
        columnId={cardDialog.columnId ?? null}
        companyId={companyId}
        userId={user?.id ?? null}
        existingCount={
          cardDialog.columnId ? (cardsByColumn[cardDialog.columnId]?.length ?? 0) : 0
        }
        onClose={() => setCardDialog({ open: false })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["kanban-cards", companyId] });
          setCardDialog({ open: false });
        }}
      />

      <LinkToKanbanDialog
        open={linkDialog.open}
        item={linkDialog.item ?? null}
        companyId={companyId}
        userId={user?.id ?? null}
        lanes={lanesQ.data ?? []}
        columns={columnsQ.data ?? []}
        existingCards={cardsQ.data ?? []}
        canManageCompany={canManage}
        currentUserId={user?.id ?? null}
        onClose={() => setLinkDialog({ open: false })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["kanban-cards", companyId] });
          setLinkDialog({ open: false });
        }}
      />
    </AppLayout>
  );
}

/* =================================================================== */
/* Lane row                                                            */
/* =================================================================== */

function laneTypeIcon(t: LaneType) {
  switch (t) {
    case "department": return <Building className="h-3.5 w-3.5" />;
    case "commercial": return <Briefcase className="h-3.5 w-3.5" />;
    case "personal":   return <UserIcon className="h-3.5 w-3.5" />;
    default:           return <Columns3 className="h-3.5 w-3.5" />;
  }
}

function LaneRow({
  lane, columns, cardsByColumn, canManage, linkEnrich, onOpenLinked,
  onAddColumn, onAddCard, onEditLane, onDeleteLane, onMoveCard, onDeleteCard,
}: {
  lane: Lane;
  columns: Column[];
  cardsByColumn: Record<string, CardRow[]>;
  canManage: boolean;
  linkEnrich: {
    contacts: Record<string, { name: string | null; phone: string | null }>;
    tickets: Record<string, { contact_name: string | null; department_name: string | null; status: string }>;
    opportunities: Record<string, { title: string; amount: number | null; status: string }>;
  };
  onOpenLinked: (card: CardRow) => void;
  onAddColumn: () => void;
  onAddCard: (columnId: string) => void;
  onEditLane: () => void;
  onDeleteLane: () => void;
  onMoveCard: (cardId: string, newColumnId: string) => void;
  onDeleteCard: (cardId: string) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant="outline" className={`gap-1 ${LANE_TYPE_COLORS[lane.lane_type]}`}>
            {laneTypeIcon(lane.lane_type)} {LANE_TYPE_LABEL[lane.lane_type]}
          </Badge>
          <h3 className="font-semibold text-sm truncate">{lane.name}</h3>
          {lane.is_personal && (
            <Badge variant="outline" className="text-[10px]">Pessoal</Badge>
          )}
        </div>
        {canManage && (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-7" onClick={onAddColumn}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Coluna
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEditLane}>Editar linha</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={onDeleteLane}>
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Ocultar linha
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <div className="overflow-x-auto scrollbar-thin">
        <div className="flex gap-3 p-3 min-w-min">
          {columns.length === 0 ? (
            <div className="text-xs text-muted-foreground p-4">
              Nenhuma coluna nesta linha. {canManage && "Crie a primeira coluna acima."}
            </div>
          ) : (
            columns.map((col) => (
              <div
                key={col.id}
                className="w-64 shrink-0 rounded-md border bg-card/50 flex flex-col max-h-[60vh]"
              >
                <div
                  className="flex items-center justify-between px-2 py-1.5 border-b rounded-t-md"
                  style={{ borderTopColor: colorHex(col.color), borderTopWidth: 3 }}
                >
                  <div className="min-w-0 flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: colorHex(col.color) }}
                    />
                    <span className="text-xs font-medium truncate">{col.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      ({(cardsByColumn[col.id] ?? []).length})
                    </span>
                  </div>
                  {canManage && (
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onAddCard(col.id)}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-2">
                  {(cardsByColumn[col.id] ?? []).length === 0 ? (
                    <p className="text-[11px] text-muted-foreground text-center py-4">
                      Sem cards
                    </p>
                  ) : (
                    (cardsByColumn[col.id] ?? []).map((card) => (
                      <div
                        key={card.id}
                        className="rounded-md border bg-background p-2 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="text-xs font-medium leading-tight line-clamp-2">
                            {card.title}
                          </div>
                          {canManage && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-5 w-5 -mr-1 -mt-1">
                                  <MoreVertical className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {(card.ticket_id || card.opportunity_id || card.contact_id) && (
                                  <>
                                    <DropdownMenuItem onClick={() => onOpenLinked(card)}>
                                      Abrir vinculado
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                  </>
                                )}
                                {columns.filter((c) => c.id !== col.id).length > 0 && (
                                  <>
                                    <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground flex items-center gap-1">
                                      <ArrowRightLeft className="h-3 w-3" /> Mover para
                                    </div>
                                    {columns.filter((c) => c.id !== col.id).map((c) => (
                                      <DropdownMenuItem key={c.id} onClick={() => onMoveCard(card.id, c.id)}>
                                        {c.name}
                                      </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuSeparator />
                                  </>
                                )}
                                <DropdownMenuItem className="text-destructive" onClick={() => onDeleteCard(card.id)}>
                                  <Trash2 className="h-3 w-3 mr-2" /> Remover
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                        {card.description && (
                          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-3">
                            {card.description}
                          </p>
                        )}
                        <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                          <Badge variant="outline" className="text-[9px] px-1 py-0">
                            {card.card_type === "manual" ? "Manual"
                              : card.card_type === "ticket" ? "Atendimento"
                              : card.card_type === "contact" ? "Contato"
                              : card.card_type === "opportunity" ? "Oportunidade"
                              : card.card_type}
                          </Badge>
                          {card.ticket_id && linkEnrich.tickets[card.ticket_id] && (
                            <span className="text-[10px] text-muted-foreground truncate">
                              {linkEnrich.tickets[card.ticket_id].contact_name || "—"}
                              {linkEnrich.tickets[card.ticket_id].department_name
                                ? ` · ${linkEnrich.tickets[card.ticket_id].department_name}`
                                : ""}
                            </span>
                          )}
                          {card.contact_id && linkEnrich.contacts[card.contact_id] && (
                            <span className="text-[10px] text-muted-foreground truncate">
                              {linkEnrich.contacts[card.contact_id].phone || ""}
                            </span>
                          )}
                          {card.opportunity_id && linkEnrich.opportunities[card.opportunity_id] && (
                            <span className="text-[10px] text-muted-foreground truncate">
                              {linkEnrich.opportunities[card.opportunity_id].amount != null
                                ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
                                    .format(Number(linkEnrich.opportunities[card.opportunity_id].amount))
                                : ""}
                              {" · "}
                              {linkEnrich.opportunities[card.opportunity_id].status}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  );
}

/* =================================================================== */
/* Dialogs                                                             */
/* =================================================================== */

function LaneDialog({
  open, lane, departments, companyId, userId, canManageCompany, onClose, onSaved,
}: {
  open: boolean;
  lane: Lane | null;
  departments: { id: string; name: string; is_active: boolean }[];
  companyId: string;
  userId: string | null;
  canManageCompany: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [laneType, setLaneType] = useState<LaneType>("custom");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(lane?.name ?? "");
      setLaneType((lane?.lane_type as LaneType) ?? "custom");
      setDepartmentId(lane?.department_id ?? "");
      setIsActive(lane?.is_active ?? true);
    }
  }, [open, lane]);

  // Quando o usuário comum não tem permissão de empresa, força tipo "pessoal".
  useEffect(() => {
    if (open && !lane && !canManageCompany) setLaneType("personal");
  }, [open, lane, canManageCompany]);

  const save = async () => {
    if (!name.trim()) {
      toast({ title: "Informe o nome da linha", variant: "destructive" });
      return;
    }
    if (laneType === "department" && !departmentId) {
      toast({ title: "Selecione o setor vinculado", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        lane_type: laneType,
        department_id: laneType === "department" ? departmentId : null,
        is_personal: laneType === "personal",
        owner_user_id: laneType === "personal" ? userId : null,
        is_active: isActive,
      };
      if (lane) {
        const { error } = await (supabase as any)
          .from("kanban_lanes").update(payload).eq("id", lane.id);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any)
          .from("kanban_lanes")
          .insert({ ...payload, company_id: companyId, created_by: userId })
          .select("id")
          .single();
        if (error) throw error;
        await writeAudit(companyId, userId, "kanban.lane_created", {
          lane_id: data?.id, lane_type: laneType,
        });
      }
      onSaved();
    } catch (e: any) {
      toast({ title: "Erro ao salvar linha", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lane ? "Editar linha" : "Nova linha"}</DialogTitle>
          <DialogDescription>
            Linhas organizam o quadro por processo, setor ou uso pessoal.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Vendas, Suporte, Minha organização" />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={laneType} onValueChange={(v) => setLaneType(v as LaneType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {canManageCompany && <SelectItem value="custom">Personalizada</SelectItem>}
                {canManageCompany && <SelectItem value="department">Setor</SelectItem>}
                {canManageCompany && <SelectItem value="commercial">Comercial</SelectItem>}
                <SelectItem value="personal">Pessoal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {laneType === "department" && (
            <div className="space-y-1.5">
              <Label>Setor vinculado</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {departments.filter((d) => d.is_active).map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Vinculo informativo. Automações de transferência serão habilitadas em fases futuras.
              </p>
            </div>
          )}
          {laneType === "personal" && (
            <p className="text-[11px] text-muted-foreground">
              Linhas pessoais são visíveis apenas para você e administradores da empresa.
            </p>
          )}
          {lane && (
            <div className="flex items-center justify-between border rounded-md px-3 py-2">
              <div>
                <Label className="text-sm">Ativa</Label>
                <p className="text-[11px] text-muted-foreground">Linhas inativas continuam visíveis, mas marcadas.</p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ColumnDialog({
  open, laneId, companyId, userId, existingCount, onClose, onSaved,
}: {
  open: boolean;
  laneId: string | null;
  companyId: string;
  userId: string | null;
  existingCount: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>("slate");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setName(""); setColor("slate"); }
  }, [open]);

  const save = async () => {
    if (!laneId) return;
    if (!name.trim()) {
      toast({ title: "Informe o nome da coluna", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await (supabase as any)
        .from("kanban_columns")
        .insert({
          company_id: companyId,
          lane_id: laneId,
          name: name.trim(),
          color,
          position: existingCount,
        })
        .select("id")
        .single();
      if (error) throw error;
      await writeAudit(companyId, userId, "kanban.column_created", {
        column_id: data?.id, lane_id: laneId,
      });
      onSaved();
    } catch (e: any) {
      toast({ title: "Erro ao salvar coluna", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova coluna</DialogTitle>
          <DialogDescription>Etapa dentro da linha.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Novo, Em atendimento, Ganha" />
          </div>
          <div className="space-y-1.5">
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((p) => (
                <button
                  key={p.v}
                  type="button"
                  onClick={() => setColor(p.v)}
                  className={`h-7 w-7 rounded-full border-2 ${color === p.v ? "border-foreground" : "border-transparent"}`}
                  style={{ backgroundColor: p.hex }}
                  title={p.l}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CardDialog({
  open, laneId, columnId, companyId, userId, existingCount, onClose, onSaved,
}: {
  open: boolean;
  laneId: string | null;
  columnId: string | null;
  companyId: string;
  userId: string | null;
  existingCount: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setTitle(""); setDescription(""); }
  }, [open]);

  const save = async () => {
    if (!laneId || !columnId) return;
    if (!title.trim()) {
      toast({ title: "Informe o título do card", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await (supabase as any)
        .from("kanban_cards")
        .insert({
          company_id: companyId,
          lane_id: laneId,
          column_id: columnId,
          title: title.trim(),
          description: description.trim() || null,
          card_type: "manual",
          position: existingCount,
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw error;
      await writeAudit(companyId, userId, "kanban.card_created", {
        card_id: data?.id, lane_id: laneId, column_id: columnId, card_type: "manual",
      });
      onSaved();
    } catch (e: any) {
      toast({ title: "Erro ao salvar card", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo card</DialogTitle>
          <DialogDescription>
            Cards manuais são apenas organizacionais e não alteram atendimentos, oportunidades ou comissões.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* =================================================================== */
/* Link to Kanban (sidebar action)                                     */
/* =================================================================== */

function LinkToKanbanDialog({
  open, item, companyId, userId, lanes, columns, existingCards,
  canManageCompany, currentUserId, onClose, onSaved,
}: {
  open: boolean;
  item: SideItem | null;
  companyId: string | null;
  userId: string | null;
  lanes: Lane[];
  columns: Column[];
  existingCards: CardRow[];
  canManageCompany: boolean;
  currentUserId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [laneId, setLaneId] = useState<string>("");
  const [columnId, setColumnId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const visibleLanes = useMemo(
    () => lanes.filter((l) =>
      l.is_active && (canManageCompany || !l.is_personal || l.owner_user_id === currentUserId)
    ),
    [lanes, canManageCompany, currentUserId],
  );
  const laneColumns = useMemo(
    () => columns.filter((c) => c.lane_id === laneId).sort((a, b) => a.position - b.position),
    [columns, laneId],
  );

  useEffect(() => {
    if (!open || !item) return;
    setTitle(item.label || "");
    setDescription("");
    setLaneId("");
    setColumnId("");
  }, [open, item]);

  useEffect(() => {
    if (laneColumns.length && !laneColumns.find((c) => c.id === columnId)) {
      setColumnId(laneColumns[0].id);
    }
  }, [laneColumns, columnId]);

  if (!item) return null;

  const cardTypeLabel =
    item.kind === "ticket" ? "Atendimento"
    : item.kind === "opportunity" ? "Oportunidade"
    : "Contato";

  async function save() {
    if (!companyId || !userId || !item) return;
    if (!laneId || !columnId) {
      toast({ title: "Selecione linha e coluna", variant: "destructive" });
      return;
    }
    const lane = lanes.find((l) => l.id === laneId);
    const col = columns.find((c) => c.id === columnId);
    if (!lane || !col || lane.company_id !== companyId || col.lane_id !== laneId) {
      toast({ title: "Seleção inválida", variant: "destructive" });
      return;
    }
    // duplicate check
    const dup = existingCards.find((c) =>
      c.column_id === columnId &&
      ((item.kind === "ticket" && c.ticket_id === item.id) ||
       (item.kind === "contact" && c.contact_id === item.id) ||
       (item.kind === "opportunity" && c.opportunity_id === item.id))
    );
    if (dup) {
      toast({ title: "Este item já está nesta coluna do Kanban." });
      return;
    }

    setSaving(true);
    try {
      const position = existingCards.filter((c) => c.column_id === columnId).length;
      const payload: Record<string, unknown> = {
        company_id: companyId,
        lane_id: laneId,
        column_id: columnId,
        title: title.trim() || item.label,
        description: description.trim() || null,
        card_type: item.kind,
        position,
        created_by: userId,
      };
      if (item.kind === "ticket") payload.ticket_id = item.id;
      if (item.kind === "contact") payload.contact_id = item.id;
      if (item.kind === "opportunity") payload.opportunity_id = item.id;

      const { data, error } = await (supabase as any)
        .from("kanban_cards")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;

      await writeAudit(companyId, userId, "kanban.card_linked", {
        card_id: data?.id,
        card_type: item.kind,
        ticket_id: item.kind === "ticket" ? item.id : null,
        contact_id: item.kind === "contact" ? item.id : null,
        opportunity_id: item.kind === "opportunity" ? item.id : null,
        lane_id: laneId,
        column_id: columnId,
        source: "kanban_sidebar",
      });

      toast({ title: `${cardTypeLabel} adicionado ao Kanban` });
      onSaved();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao adicionar";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar ao Kanban</DialogTitle>
          <DialogDescription>
            Vínculo apenas organizacional — não altera o {cardTypeLabel.toLowerCase()} original.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Input value={cardTypeLabel} disabled />
          </div>
          <div className="space-y-1.5">
            <Label>Linha</Label>
            <Select value={laneId} onValueChange={setLaneId}>
              <SelectTrigger><SelectValue placeholder="Selecione a linha" /></SelectTrigger>
              <SelectContent>
                {visibleLanes.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Coluna</Label>
            <Select value={columnId} onValueChange={setColumnId} disabled={!laneId}>
              <SelectTrigger><SelectValue placeholder="Selecione a coluna" /></SelectTrigger>
              <SelectContent>
                {laneColumns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Título do card</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição (opcional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving || !laneId || !columnId}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
