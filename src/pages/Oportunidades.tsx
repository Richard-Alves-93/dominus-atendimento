import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, Search, ExternalLink, Pencil, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TagFilter, useEntityIdsByTags } from "@/features/tags/TagFilter";

type OppStatus = "open" | "won" | "lost" | "canceled";

const STATUS_LABEL: Record<OppStatus, string> = {
  open: "Aberta",
  won: "Ganha",
  lost: "Perdida",
  canceled: "Cancelada",
};

const STATUS_BADGE: Record<OppStatus, string> = {
  open: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  won: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  lost: "bg-red-500/10 text-red-600 border-red-500/20",
  canceled: "bg-muted text-muted-foreground border-border",
};

type Opportunity = {
  id: string;
  company_id: string;
  ticket_id: string | null;
  contact_id: string | null;
  department_id: string | null;
  assigned_user_id: string | null;
  created_by: string;
  title: string;
  status: OppStatus;
  amount: number | null;
  currency: string;
  source: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

function formatBRL(n: number | null | undefined): string {
  if (n == null) return "—";
  try {
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${n.toFixed(2)}`;
  }
}

function parseAmount(s: string): number | null {
  if (!s.trim()) return null;
  const normalized = s.replace(/\./g, "").replace(",", ".").replace(/[^\d.\-]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return iso; }
}

const PERIODS = [
  { v: "all", l: "Todos os períodos" },
  { v: "7", l: "Últimos 7 dias" },
  { v: "30", l: "Últimos 30 dias" },
  { v: "90", l: "Últimos 90 dias" },
] as const;

export default function Oportunidades() {
  const { activeCompanyId, activeMembership } = useCompany();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const isMaster = profile?.is_master === true || profile?.global_role === "master";
  const role = activeMembership?.role;
  const canManage = isMaster || role === "owner" || role === "admin" || role === "manager";

  const [statusFilter, setStatusFilter] = useState<"all" | OppStatus>("all");
  const [assignedFilter, setAssignedFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);

  const oppsQuery = useQuery({
    queryKey: ["opportunities", activeCompanyId, statusFilter, assignedFilter, periodFilter],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("opportunities")
        .select("*")
        .eq("company_id", activeCompanyId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (assignedFilter !== "all") q = q.eq("assigned_user_id", assignedFilter);
      if (periodFilter !== "all") {
        const days = Number(periodFilter);
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        q = q.gte("created_at", since);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Opportunity[];
    },
  });

  const opps = oppsQuery.data ?? [];

  const userIds = useMemo(
    () => Array.from(new Set(opps.flatMap((o) => [o.assigned_user_id, o.created_by]).filter(Boolean))) as string[],
    [opps],
  );
  const contactIds = useMemo(
    () => Array.from(new Set(opps.map((o) => o.contact_id).filter(Boolean))) as string[],
    [opps],
  );
  const deptIds = useMemo(
    () => Array.from(new Set(opps.map((o) => o.department_id).filter(Boolean))) as string[],
    [opps],
  );

  const profilesQuery = useQuery({
    queryKey: ["opps-profiles", activeCompanyId, userIds.join(",")],
    enabled: !!activeCompanyId && userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);
      const m = new Map<string, { name: string }>();
      for (const r of (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
        m.set(r.id, { name: r.full_name ?? r.email ?? "Usuário" });
      }
      return m;
    },
  });

  const contactsQuery = useQuery({
    queryKey: ["opps-contacts", activeCompanyId, contactIds.join(",")],
    enabled: !!activeCompanyId && contactIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("contacts").select("id, name, phone_number")
        .eq("company_id", activeCompanyId!).in("id", contactIds);
      const m = new Map<string, { label: string }>();
      for (const r of (data ?? []) as Array<{ id: string; name: string | null; phone_number: string | null }>) {
        m.set(r.id, { label: r.name ?? r.phone_number ?? "—" });
      }
      return m;
    },
  });

  const deptsQuery = useQuery({
    queryKey: ["opps-depts", activeCompanyId, deptIds.join(",")],
    enabled: !!activeCompanyId && deptIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("departments").select("id, name")
        .eq("company_id", activeCompanyId!).in("id", deptIds);
      const m = new Map<string, string>();
      for (const r of (data ?? []) as Array<{ id: string; name: string }>) m.set(r.id, r.name);
      return m;
    },
  });

  // Responsáveis disponíveis (membros ativos da empresa)
  const membersQuery = useQuery({
    queryKey: ["opps-members", activeCompanyId],
    enabled: !!activeCompanyId,
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

  const tagFilteredOppIds = useEntityIdsByTags(activeCompanyId, "opportunity", tagFilter);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return opps.filter((o) => {
      if (tagFilter.length > 0 && !tagFilteredOppIds?.has(o.id)) return false;
      if (!term) return true;
      const contact = o.contact_id ? contactsQuery.data?.get(o.contact_id)?.label ?? "" : "";
      return o.title.toLowerCase().includes(term) || contact.toLowerCase().includes(term);
    });
  }, [opps, search, contactsQuery.data, tagFilter, tagFilteredOppIds]);

  const summary = useMemo(() => {
    let openCount = 0, openValue = 0, wonCount = 0, wonValue = 0, lostCount = 0;
    for (const o of opps) {
      if (o.status === "open") { openCount++; openValue += o.amount ?? 0; }
      else if (o.status === "won") { wonCount++; wonValue += o.amount ?? 0; }
      else if (o.status === "lost") { lostCount++; }
    }
    return { openCount, openValue, wonCount, wonValue, lostCount };
  }, [opps]);

  // Edição
  const [editing, setEditing] = useState<Opportunity | null>(null);
  const [eTitle, setETitle] = useState("");
  const [eAmount, setEAmount] = useState("");
  const [eStatus, setEStatus] = useState<OppStatus>("open");
  const [eAssigned, setEAssigned] = useState<string>("none");
  const [eNotes, setENotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setETitle(editing.title);
      setEAmount(editing.amount != null ? editing.amount.toString().replace(".", ",") : "");
      setEStatus(editing.status);
      setEAssigned(editing.assigned_user_id ?? "none");
      setENotes(editing.notes ?? "");
    }
  }, [editing]);

  const handleSave = async () => {
    if (!editing || !user) return;
    const t = eTitle.trim();
    if (!t) { toast({ title: "Informe o título.", variant: "destructive" }); return; }
    const amt = parseAmount(eAmount);
    const newAssigned = eAssigned === "none" ? null : eAssigned;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("opportunities")
        .update({
          title: t,
          amount: amt,
          status: eStatus,
          assigned_user_id: newAssigned,
          notes: eNotes.trim() || null,
        })
        .eq("id", editing.id);
      if (error) throw error;

      // Auditoria — best-effort
      try {
        const events: Array<{ type: string; meta: Record<string, unknown> }> = [];
        if (editing.status !== eStatus) {
          events.push({
            type: "opportunity.status_changed",
            meta: { opportunity_id: editing.id, old_status: editing.status, new_status: eStatus, ticket_id: editing.ticket_id },
          });
        }
        events.push({
          type: "opportunity.updated",
          meta: {
            opportunity_id: editing.id,
            old_amount: editing.amount, new_amount: amt,
            assigned_user_id: newAssigned,
            ticket_id: editing.ticket_id,
          },
        });
        for (const e of events) {
          await supabase.from("audit_logs").insert({
            company_id: editing.company_id,
            event_type: e.type,
            ticket_id: editing.ticket_id,
            changed_by: user.id,
            metadata: e.meta,
          } as any);
        }
      } catch { /* silencioso */ }

      toast({ title: "Oportunidade atualizada." });
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["opportunities", activeCompanyId] });
    } catch (e: any) {
      toast({ title: "Não foi possível atualizar.", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

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

  const userName = (id: string | null) => (id ? profilesQuery.data?.get(id)?.name ?? "—" : "—");

  return (
    <AppLayout title="Oportunidades">
      <div className="p-4 sm:p-6 space-y-4 min-w-0">
        {/* Resumo */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Em aberto</p>
            <p className="text-xl font-semibold">{summary.openCount}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Valor em aberto</p>
            <p className="text-xl font-semibold">{formatBRL(summary.openValue)}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Ganhas</p>
            <p className="text-xl font-semibold">{summary.wonCount}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Valor ganho</p>
            <p className="text-xl font-semibold">{formatBRL(summary.wonValue)}</p>
          </Card>
          <Card className="p-3 col-span-2 lg:col-span-1">
            <p className="text-xs text-muted-foreground">Perdidas</p>
            <p className="text-xl font-semibold">{summary.lostCount}</p>
          </Card>
        </div>

        {/* Filtros */}
        <Card className="p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Buscar por título ou contato"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {(Object.keys(STATUS_LABEL) as OppStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={assignedFilter} onValueChange={setAssignedFilter}>
              <SelectTrigger><SelectValue placeholder="Responsável" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os responsáveis</SelectItem>
                {(membersQuery.data ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        {oppsQuery.isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Carregando…
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Briefcase className="w-6 h-6 text-primary" />
            </div>
            <p className="font-medium">Nenhuma oportunidade encontrada</p>
            <p className="text-sm text-muted-foreground mt-1">
              Crie oportunidades a partir de um atendimento em Atendimentos.
            </p>
          </Card>
        ) : (
          <>
            {/* Mobile: cards */}
            <div className="lg:hidden space-y-2">
              {filtered.map((o) => (
                <Card key={o.id} className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{o.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {o.contact_id ? contactsQuery.data?.get(o.contact_id)?.label ?? "—" : "Sem contato"}
                      </p>
                    </div>
                    <Badge variant="outline" className={STATUS_BADGE[o.status]}>
                      {STATUS_LABEL[o.status]}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Valor</p>
                      <p className="font-medium">{formatBRL(o.amount)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Responsável</p>
                      <p className="font-medium truncate">{userName(o.assigned_user_id)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Setor</p>
                      <p className="font-medium truncate">
                        {o.department_id ? deptsQuery.data?.get(o.department_id) ?? "—" : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Criado em</p>
                      <p className="font-medium">{formatDate(o.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    {o.ticket_id && (
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => openTicket(o.ticket_id)}>
                        <ExternalLink className="w-4 h-4 mr-1" /> Atendimento
                      </Button>
                    )}
                    {canManage && (
                      <Button size="sm" className="flex-1" onClick={() => setEditing(o)}>
                        <Pencil className="w-4 h-4 mr-1" /> Editar
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>

            {/* Desktop: tabela */}
            <Card className="hidden lg:block overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">Título</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Valor</th>
                      <th className="px-3 py-2 font-medium">Responsável</th>
                      <th className="px-3 py-2 font-medium">Contato</th>
                      <th className="px-3 py-2 font-medium">Setor</th>
                      <th className="px-3 py-2 font-medium">Criado</th>
                      <th className="px-3 py-2 font-medium text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((o) => (
                      <tr key={o.id} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">{o.title}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={STATUS_BADGE[o.status]}>
                            {STATUS_LABEL[o.status]}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">{formatBRL(o.amount)}</td>
                        <td className="px-3 py-2">{userName(o.assigned_user_id)}</td>
                        <td className="px-3 py-2">
                          {o.contact_id ? contactsQuery.data?.get(o.contact_id)?.label ?? "—" : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {o.department_id ? deptsQuery.data?.get(o.department_id) ?? "—" : "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{formatDate(o.created_at)}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            {o.ticket_id && (
                              <Button size="sm" variant="ghost" onClick={() => openTicket(o.ticket_id)}>
                                <ExternalLink className="w-4 h-4 mr-1" /> Atendimento
                              </Button>
                            )}
                            {canManage && (
                              <Button size="sm" variant="ghost" onClick={() => setEditing(o)}>
                                <Pencil className="w-4 h-4 mr-1" /> Editar
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>

      {/* Edição */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar oportunidade</DialogTitle>
            <DialogDescription>Atualize os dados comerciais.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="e-title">Título</Label>
              <Input id="e-title" value={eTitle} onChange={(e) => setETitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="e-amount">Valor (R$)</Label>
                <Input id="e-amount" inputMode="decimal" value={eAmount} onChange={(e) => setEAmount(e.target.value)} placeholder="0,00" />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={eStatus} onValueChange={(v) => setEStatus(v as OppStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABEL) as OppStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={eAssigned} onValueChange={setEAssigned}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem responsável</SelectItem>
                  {(membersQuery.data ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-notes">Observações</Label>
              <Textarea id="e-notes" rows={3} value={eNotes} onChange={(e) => setENotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
