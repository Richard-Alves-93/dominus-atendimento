import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet, Search, ExternalLink, Loader2, Eye, Check, DollarSign, Ban, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { supabase } from "@/integrations/supabase/client";

type CommissionStatus = "pending" | "approved" | "paid" | "canceled";

const STATUS_LABEL: Record<CommissionStatus, string> = {
  pending: "Pendente",
  approved: "Aprovada",
  paid: "Paga",
  canceled: "Cancelada",
};

const STATUS_BADGE: Record<CommissionStatus, string> = {
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  approved: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  paid: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  canceled: "bg-muted text-muted-foreground border-border",
};

type Commission = {
  id: string;
  company_id: string;
  opportunity_id: string | null;
  ticket_id: string | null;
  contact_id: string | null;
  seller_user_id: string;
  commission_percentage: number;
  opportunity_amount: number | null;
  commission_amount: number | null;
  status: CommissionStatus;
  generated_at: string;
  paid_at: string | null;
  created_at: string;
};

function formatBRL(n: number | null | undefined): string {
  if (n == null) return "—";
  try { return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
  catch { return `R$ ${Number(n).toFixed(2)}`; }
}
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }); }
  catch { return iso; }
}

const PERIODS = [
  { v: "all", l: "Todos os períodos" },
  { v: "7", l: "Últimos 7 dias" },
  { v: "30", l: "Últimos 30 dias" },
  { v: "90", l: "Últimos 90 dias" },
] as const;

export default function Comissoes() {
  const { activeCompanyId, activeMembership } = useCompany();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const isMaster = profile?.is_master === true || profile?.global_role === "master";
  const role = activeMembership?.role;
  const canSeeAllSellers = isMaster || role === "owner" || role === "admin" || role === "manager" || role === "financial";
  const canManage = isMaster || role === "owner" || role === "admin" || role === "financial";

  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"all" | CommissionStatus>("all");
  const [sellerFilter, setSellerFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<Commission | null>(null);
  const [pendingAction, setPendingAction] = useState<{ c: Commission; action: "approve" | "pay" | "cancel" } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const runAction = async () => {
    if (!pendingAction) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("update_commission_status", {
        _commission_id: pendingAction.c.id,
        _action: pendingAction.action,
      });
      if (error) throw error;
      toast.success(
        pendingAction.action === "approve" ? "Comissão aprovada" :
        pendingAction.action === "pay" ? "Comissão marcada como paga" :
        "Comissão cancelada"
      );
      setPendingAction(null);
      await queryClient.invalidateQueries({ queryKey: ["commissions", activeCompanyId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao atualizar comissão");
    } finally {
      setSubmitting(false);
    }
  };

  const commissionsQuery = useQuery({
    queryKey: ["commissions", activeCompanyId, statusFilter, sellerFilter, periodFilter],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("sales_commissions")
        .select("*")
        .eq("company_id", activeCompanyId!)
        .is("deleted_at", null)
        .order("generated_at", { ascending: false })
        .limit(500);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (sellerFilter !== "all") q = q.eq("seller_user_id", sellerFilter);
      if (periodFilter !== "all") {
        const days = Number(periodFilter);
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        q = q.gte("generated_at", since);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Commission[];
    },
  });

  const commissions = commissionsQuery.data ?? [];

  const sellerIds = useMemo(
    () => Array.from(new Set(commissions.map((c) => c.seller_user_id).filter(Boolean))),
    [commissions],
  );
  const oppIds = useMemo(
    () => Array.from(new Set(commissions.map((c) => c.opportunity_id).filter(Boolean))) as string[],
    [commissions],
  );
  const contactIds = useMemo(
    () => Array.from(new Set(commissions.map((c) => c.contact_id).filter(Boolean))) as string[],
    [commissions],
  );

  const profilesQuery = useQuery({
    queryKey: ["commissions-profiles", activeCompanyId, sellerIds.join(",")],
    enabled: !!activeCompanyId && sellerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", sellerIds);
      const m = new Map<string, string>();
      for (const r of (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
        m.set(r.id, r.full_name ?? r.email ?? "Usuário");
      }
      return m;
    },
  });

  const oppsQuery = useQuery({
    queryKey: ["commissions-opps", activeCompanyId, oppIds.join(",")],
    enabled: !!activeCompanyId && oppIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("opportunities").select("id, title")
        .eq("company_id", activeCompanyId!).in("id", oppIds);
      const m = new Map<string, string>();
      for (const r of (data ?? []) as Array<{ id: string; title: string }>) m.set(r.id, r.title);
      return m;
    },
  });

  const contactsQuery = useQuery({
    queryKey: ["commissions-contacts", activeCompanyId, contactIds.join(",")],
    enabled: !!activeCompanyId && contactIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("contacts").select("id, name, phone_number")
        .eq("company_id", activeCompanyId!).in("id", contactIds);
      const m = new Map<string, string>();
      for (const r of (data ?? []) as Array<{ id: string; name: string | null; phone_number: string | null }>) {
        m.set(r.id, r.name ?? r.phone_number ?? "—");
      }
      return m;
    },
  });

  const membersQuery = useQuery({
    queryKey: ["commissions-members", activeCompanyId],
    enabled: !!activeCompanyId && canSeeAllSellers,
    queryFn: async () => {
      const { data: cu } = await supabase
        .from("company_users").select("user_id")
        .eq("company_id", activeCompanyId!).eq("status", "active");
      const ids = ((cu ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
      if (ids.length === 0) return [] as Array<{ id: string; name: string }>;
      const { data: ps } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      return ((ps ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>)
        .map((p) => ({ id: p.id, name: p.full_name ?? p.email ?? "Usuário" }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    },
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return commissions;
    return commissions.filter((c) => {
      const seller = profilesQuery.data?.get(c.seller_user_id) ?? "";
      const opp = c.opportunity_id ? oppsQuery.data?.get(c.opportunity_id) ?? "" : "";
      const contact = c.contact_id ? contactsQuery.data?.get(c.contact_id) ?? "" : "";
      return (
        seller.toLowerCase().includes(term) ||
        opp.toLowerCase().includes(term) ||
        contact.toLowerCase().includes(term)
      );
    });
  }, [commissions, search, profilesQuery.data, oppsQuery.data, contactsQuery.data]);

  const summary = useMemo(() => {
    const init = { pending: 0, approved: 0, paid: 0, canceled: 0 };
    const counts = { ...init };
    const values = { ...init };
    for (const c of commissions) {
      counts[c.status] += 1;
      values[c.status] += Number(c.commission_amount ?? 0);
    }
    return { counts, values };
  }, [commissions]);

  const openTicket = (ticketId: string | null) => {
    if (!ticketId || !activeCompanyId || !profile?.id) return;
    try {
      sessionStorage.setItem(
        `dominus:selected_ticket:${activeCompanyId}:${profile.id}`,
        JSON.stringify({ ticket_id: ticketId, company_id: activeCompanyId, updated_at: new Date().toISOString() }),
      );
    } catch { /* ignore */ }
    navigate("/app/tickets");
  };

  const sellerName = (id: string) => profilesQuery.data?.get(id) ?? "—";
  const oppTitle = (id: string | null) => (id ? oppsQuery.data?.get(id) ?? "—" : "—");
  const contactLabel = (id: string | null) => (id ? contactsQuery.data?.get(id) ?? "—" : "—");

  const summaryCards: Array<{ key: CommissionStatus; label: string; }> = [
    { key: "pending", label: "Pendentes" },
    { key: "approved", label: "Aprovadas" },
    { key: "paid", label: "Pagas" },
    { key: "canceled", label: "Canceladas" },
  ];

  return (
    <AppLayout title="Comissões">
      <div className="p-4 sm:p-6 space-y-4 min-w-0">
        {/* Resumo */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {summaryCards.map((s) => (
            <Card key={s.key} className="p-3">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-xl font-semibold">{summary.counts[s.key]}</p>
              <p className="text-xs text-muted-foreground mt-1">{formatBRL(summary.values[s.key])}</p>
            </Card>
          ))}
        </div>

        {/* Filtros */}
        <Card className="p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Buscar por vendedor, oportunidade ou contato"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {(Object.keys(STATUS_LABEL) as CommissionStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canSeeAllSellers ? (
              <Select value={sellerFilter} onValueChange={setSellerFilter}>
                <SelectTrigger><SelectValue placeholder="Vendedor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os vendedores</SelectItem>
                  {(membersQuery.data ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : <div />}
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger><SelectValue placeholder="Período" /></SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        {/* Lista */}
        {commissionsQuery.isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Carregando…
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Wallet className="w-6 h-6 text-primary" />
            </div>
            <p className="font-medium">Nenhuma comissão encontrada</p>
            <p className="text-sm text-muted-foreground mt-1">
              Comissões são geradas automaticamente quando uma oportunidade é marcada como ganha.
            </p>
          </Card>
        ) : (
          <>
            {/* Desktop: tabela */}
            <Card className="hidden lg:block overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Oportunidade</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead className="text-right">Venda</TableHead>
                    <TableHead className="text-right">%</TableHead>
                    <TableHead className="text-right">Comissão</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Gerada em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{sellerName(c.seller_user_id)}</TableCell>
                      <TableCell className="max-w-[220px] truncate">{oppTitle(c.opportunity_id)}</TableCell>
                      <TableCell className="max-w-[180px] truncate">{contactLabel(c.contact_id)}</TableCell>
                      <TableCell className="text-right">{formatBRL(c.opportunity_amount)}</TableCell>
                      <TableCell className="text-right">{Number(c.commission_percentage).toFixed(2)}%</TableCell>
                      <TableCell className="text-right font-medium">{formatBRL(c.commission_amount)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_BADGE[c.status]}>
                          {STATUS_LABEL[c.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(c.generated_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setViewing(c)} title="Ver detalhes">
                            <Eye className="w-4 h-4" />
                          </Button>
                          {c.opportunity_id && (
                            <Button size="sm" variant="ghost" onClick={() => navigate("/app/oportunidades")} title="Abrir oportunidade">
                              <Wallet className="w-4 h-4" />
                            </Button>
                          )}
                          {c.ticket_id && (
                            <Button size="sm" variant="ghost" onClick={() => openTicket(c.ticket_id)} title="Abrir atendimento">
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                          )}
                          {canManage && (c.status === "pending" || c.status === "approved") && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="ghost" title="Ações">
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {c.status === "pending" && (
                                  <DropdownMenuItem onClick={() => setPendingAction({ c, action: "approve" })}>
                                    <Check className="w-4 h-4 mr-2" /> Aprovar
                                  </DropdownMenuItem>
                                )}
                                {c.status === "approved" && (
                                  <DropdownMenuItem onClick={() => setPendingAction({ c, action: "pay" })}>
                                    <DollarSign className="w-4 h-4 mr-2" /> Marcar como paga
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => setPendingAction({ c, action: "cancel" })} className="text-destructive">
                                  <Ban className="w-4 h-4 mr-2" /> Cancelar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            {/* Mobile: cards */}
            <div className="lg:hidden space-y-2">
              {filtered.map((c) => (
                <Card key={c.id} className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{sellerName(c.seller_user_id)}</p>
                      <p className="text-xs text-muted-foreground truncate">{oppTitle(c.opportunity_id)}</p>
                    </div>
                    <Badge variant="outline" className={STATUS_BADGE[c.status]}>
                      {STATUS_LABEL[c.status]}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Venda</p>
                      <p className="font-medium">{formatBRL(c.opportunity_amount)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Comissão</p>
                      <p className="font-medium">{formatBRL(c.commission_amount)} ({Number(c.commission_percentage).toFixed(2)}%)</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Contato</p>
                      <p className="font-medium truncate">{contactLabel(c.contact_id)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Gerada em</p>
                      <p className="font-medium">{formatDate(c.generated_at)}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setViewing(c)}>
                      <Eye className="w-4 h-4 mr-1" /> Detalhes
                    </Button>
                    {c.ticket_id && (
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => openTicket(c.ticket_id)}>
                        <ExternalLink className="w-4 h-4 mr-1" /> Atendimento
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Detalhes */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes da comissão</DialogTitle>
            <DialogDescription>Informações da comissão gerada.</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Vendedor</span>
                <span className="font-medium text-right">{sellerName(viewing.seller_user_id)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Oportunidade</span>
                <span className="font-medium text-right truncate max-w-[60%]">{oppTitle(viewing.opportunity_id)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Contato</span>
                <span className="font-medium text-right truncate max-w-[60%]">{contactLabel(viewing.contact_id)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Valor da venda</span>
                <span className="font-medium">{formatBRL(viewing.opportunity_amount)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Percentual</span>
                <span className="font-medium">{Number(viewing.commission_percentage).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Valor da comissão</span>
                <span className="font-medium">{formatBRL(viewing.commission_amount)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="outline" className={STATUS_BADGE[viewing.status]}>{STATUS_LABEL[viewing.status]}</Badge>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Gerada em</span>
                <span className="font-medium">{formatDate(viewing.generated_at)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Paga em</span>
                <span className="font-medium">{formatDate(viewing.paid_at)}</span>
              </div>
              <div className="flex gap-2 pt-2">
                {viewing.opportunity_id && (
                  <Button variant="outline" className="flex-1" onClick={() => { setViewing(null); navigate("/app/oportunidades"); }}>
                    Oportunidade
                  </Button>
                )}
                {viewing.ticket_id && (
                  <Button variant="outline" className="flex-1" onClick={() => { const t = viewing.ticket_id; setViewing(null); openTicket(t); }}>
                    Atendimento
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
