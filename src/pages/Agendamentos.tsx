import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Plus, Calendar as CalendarIcon, Video, MapPin, Loader2,
  User2, ChevronLeft, ChevronRight, MoreVertical, Info, CalendarClock, Ban, Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { EventModal, RescheduleTarget } from "@/components/events/EventModal";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  location: string | null;
  meeting_enabled: boolean;
  meeting_url: string | null;
  status: string;
  assigned_user_id: string;
  created_by: string;
  ticket_id: string | null;
  contact_id: string | null;
  channel_id: string | null;
  channel_type: string | null;
  send_confirmation: boolean | null;
  reminder_1h_enabled: boolean | null;
  reminder_5m_enabled: boolean | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
}

type ScopeFilter = "mine" | "team" | "all";
type StatusFilter = "all" | "scheduled" | "cancelled" | "completed";

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Agendado",
  completed: "Concluído",
  cancelled: "Cancelado",
  failed: "Falhou",
};

const WEEK_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function ymdFromIso(iso: string) {
  return ymd(new Date(iso));
}

export default function Agendamentos() {
  const { activeCompanyId, activeMembership } = useCompany();
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<ScopeFilter>("mine");
  const [status, setStatus] = useState<StatusFilter>("scheduled");

  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState<Date>(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string>(ymd(today));

  const [infoEvent, setInfoEvent] = useState<EventRow | null>(null);
  const [cancelEvent, setCancelEvent] = useState<EventRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [deleteEvent, setDeleteEvent] = useState<EventRow | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [rescheduleEvent, setRescheduleEvent] = useState<RescheduleTarget | null>(null);

  const role = activeMembership?.role ?? "agent";
  const isMaster = profile?.is_master === true;
  const isAdmin = isMaster || ["owner", "admin"].includes(role);
  const isManager = role === "manager";

  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return { start, end: days[41], days };
  }, [cursor]);

  const eventsQuery = useQuery({
    queryKey: [
      "scheduled-events",
      activeCompanyId, scope, status, user?.id, role,
      ymd(grid.start), ymd(grid.end),
    ],
    enabled: !!activeCompanyId && !!user,
    queryFn: async (): Promise<EventRow[]> => {
      const rangeStart = new Date(grid.start); rangeStart.setHours(0, 0, 0, 0);
      const rangeEnd = new Date(grid.end); rangeEnd.setHours(23, 59, 59, 999);
      let q = supabase
        .from("scheduled_events")
        .select("id, title, description, start_at, end_at, location, meeting_enabled, meeting_url, status, assigned_user_id, created_by, ticket_id, contact_id, channel_id, channel_type, send_confirmation, reminder_1h_enabled, reminder_5m_enabled, cancel_reason, cancelled_at")
        .eq("company_id", activeCompanyId!)
        .is("deleted_at", null)
        .gte("start_at", rangeStart.toISOString())
        .lte("start_at", rangeEnd.toISOString())
        .order("start_at", { ascending: true });
      if (status !== "all") q = q.eq("status", status);
      if (scope === "mine") q = q.eq("assigned_user_id", user!.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });

  // Lookup contacts for shown events
  const contactIds = useMemo(() => {
    const s = new Set<string>();
    for (const e of eventsQuery.data ?? []) if (e.contact_id) s.add(e.contact_id);
    return Array.from(s);
  }, [eventsQuery.data]);

  const contactsQuery = useQuery({
    queryKey: ["events-contacts", activeCompanyId, contactIds.join(",")],
    enabled: !!activeCompanyId && contactIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("contacts")
        .select("id, name, phone_number")
        .eq("company_id", activeCompanyId!)
        .in("id", contactIds);
      const map = new Map<string, { name: string | null; phone: string | null }>();
      (data ?? []).forEach((c: any) => map.set(c.id, { name: c.name, phone: c.phone_number }));
      return map;
    },
  });

  const userIds = useMemo(() => {
    const s = new Set<string>();
    for (const e of eventsQuery.data ?? []) {
      if (e.assigned_user_id) s.add(e.assigned_user_id);
      if (e.created_by) s.add(e.created_by);
    }
    return Array.from(s);
  }, [eventsQuery.data]);

  const usersQuery = useQuery({
    queryKey: ["events-users", userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);
      const map = new Map<string, string>();
      (data ?? []).forEach((p: any) => map.set(p.id, p.full_name ?? p.email ?? "Usuário"));
      return map;
    },
  });

  const contactLabel = (ev: EventRow) => {
    if (!ev.contact_id) return null;
    const c = contactsQuery.data?.get(ev.contact_id);
    return c?.name ?? c?.phone ?? "Contato";
  };
  const userLabel = (id: string | null) => {
    if (!id) return "—";
    if (id === user?.id) return "Você";
    return usersQuery.data?.get(id) ?? "Outro";
  };

  const eventsByDay = useMemo(() => {
    const map = new Map<string, EventRow[]>();
    for (const ev of eventsQuery.data ?? []) {
      const k = ymdFromIso(ev.start_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(ev);
    }
    return map;
  }, [eventsQuery.data]);

  const selectedDayEvents = eventsByDay.get(selectedDate) ?? [];

  const scopeOptions = useMemo(() => {
    const opts: { value: ScopeFilter; label: string }[] = [{ value: "mine", label: "Minha agenda" }];
    if (isManager) opts.push({ value: "team", label: "Equipe que gerencio" });
    if (isAdmin) opts.push({ value: "all", label: "Todos da empresa" });
    return opts;
  }, [isAdmin, isManager]);

  function canEdit(ev: EventRow) {
    if (isAdmin) return true;
    return ev.assigned_user_id === user?.id || ev.created_by === user?.id;
  }

  async function postInternalTicketNote(ev: EventRow, text: string) {
    if (!ev.ticket_id || !ev.contact_id || !activeCompanyId) return;
    await supabase.from("messages").insert({
      company_id: activeCompanyId,
      ticket_id: ev.ticket_id,
      contact_id: ev.contact_id,
      channel_id: ev.channel_id,
      direction: "outbound" as any,
      msg_type: "text" as any,
      body: text,
      from_me: true,
      status: "system",
      delivery_status: "system",
      source: "system",
      raw: {},
      sent_at: new Date().toISOString(),
    } as any);
  }

  async function confirmCancel() {
    if (!cancelEvent) return;
    if (!cancelReason.trim()) {
      toast({ title: "Motivo obrigatório", description: "Informe o motivo do cancelamento.", variant: "destructive" });
      return;
    }
    setCancelSubmitting(true);
    try {
      const { error } = await supabase
        .from("scheduled_events")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancelled_by: user?.id ?? null,
          cancel_reason: cancelReason.trim(),
        } as any)
        .eq("id", cancelEvent.id);
      if (error) throw error;
      // Audit log (best-effort)
      await supabase.from("audit_logs").insert({
        company_id: activeCompanyId!,
        event_type: "scheduled_event_cancelled",
        ticket_id: cancelEvent.ticket_id,
        changed_by: user?.id ?? null,
        reason: cancelReason.trim(),
        metadata: { event_id: cancelEvent.id, cancelled_at: new Date().toISOString() } as any,
      } as any);
      await postInternalTicketNote(
        cancelEvent,
        `${profile?.full_name ?? "Usuário"} cancelou o evento "${cancelEvent.title}". Motivo: ${cancelReason.trim()}.`,
      );
      toast({ title: "Evento cancelado", description: "Mensagens pendentes vinculadas foram canceladas." });
      setCancelEvent(null);
      setCancelReason("");
      qc.invalidateQueries({ queryKey: ["scheduled-events"] });
    } catch (e: any) {
      toast({ title: "Não foi possível cancelar", description: e?.message ?? "Erro", variant: "destructive" });
    } finally {
      setCancelSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteEvent) return;
    setDeleteSubmitting(true);
    try {
      const { error } = await supabase
        .from("scheduled_events")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: user?.id ?? null,
        } as any)
        .eq("id", deleteEvent.id);
      if (error) throw error;
      // Cancel pending scheduled messages
      await supabase
        .from("scheduled_messages")
        .update({ status: "cancelled" } as any)
        .eq("event_id", deleteEvent.id)
        .in("status", ["pending", "processing"]);
      await supabase.from("audit_logs").insert({
        company_id: activeCompanyId!,
        event_type: "scheduled_event_deleted",
        ticket_id: deleteEvent.ticket_id,
        changed_by: user?.id ?? null,
        metadata: { event_id: deleteEvent.id, deleted_at: new Date().toISOString() } as any,
      } as any);
      toast({ title: "Evento excluído" });
      setDeleteEvent(null);
      qc.invalidateQueries({ queryKey: ["scheduled-events"] });
    } catch (e: any) {
      toast({ title: "Não foi possível excluir", description: e?.message ?? "Erro", variant: "destructive" });
    } finally {
      setDeleteSubmitting(false);
    }
  }

  function goMonth(delta: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  }
  function goToday() {
    const t = new Date();
    setCursor(new Date(t.getFullYear(), t.getMonth(), 1));
    setSelectedDate(ymd(t));
  }

  const selectedLabel = useMemo(() => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
      weekday: "long", day: "2-digit", month: "long", year: "numeric",
    });
  }, [selectedDate]);

  return (
    <AppLayout title="Agendamentos">
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Agenda</h2>
            <p className="text-sm text-muted-foreground">Eventos, reuniões e follow-ups.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {scopeOptions.length > 1 && (
              <Select value={scope} onValueChange={(v) => setScope(v as ScopeFilter)}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {scopeOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="scheduled">Agendados</SelectItem>
                <SelectItem value="completed">Concluídos</SelectItem>
                <SelectItem value="cancelled">Cancelados</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-2" /> Novo evento</Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          {/* Calendar */}
          <Card className="lg:col-span-2 p-3 md:p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => goMonth(-1)} aria-label="Mês anterior">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => goMonth(1)} aria-label="Próximo mês">
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" className="ml-1" onClick={goToday}>Hoje</Button>
              </div>
              <div className="font-medium capitalize">
                {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
              </div>
              <div className="w-[120px]" />
            </div>

            <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground mb-1">
              {WEEK_DAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {grid.days.map((d) => {
                const key = ymd(d);
                const inMonth = d.getMonth() === cursor.getMonth();
                const isToday = key === ymd(today);
                const isSelected = key === selectedDate;
                const list = eventsByDay.get(key) ?? [];
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDate(key)}
                    className={cn(
                      "aspect-square sm:aspect-auto sm:h-16 rounded-md border text-left p-1 flex flex-col transition-colors",
                      "hover:bg-accent",
                      !inMonth && "opacity-40",
                      isSelected ? "border-primary ring-1 ring-primary" : "border-border",
                      isToday && !isSelected && "bg-accent/40",
                    )}
                  >
                    <span className={cn("text-xs font-medium", isToday && "text-primary")}>
                      {d.getDate()}
                    </span>
                    {list.length > 0 && (
                      <div className="mt-auto flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                        <span className="text-[10px] text-muted-foreground">
                          {list.length} {list.length === 1 ? "evento" : "eventos"}
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Day list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium capitalize">Eventos de {selectedLabel}</h3>
            </div>
            {eventsQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
              </div>
            ) : selectedDayEvents.length === 0 ? (
              <Card className="p-6 text-center">
                <CalendarIcon className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhum agendamento para este dia.</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {selectedDayEvents.map((ev) => {
                  const cName = contactLabel(ev);
                  const editable = canEdit(ev);
                  return (
                    <Card key={ev.id} className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono text-muted-foreground">
                              {fmtTime(ev.start_at)}{ev.end_at ? `–${fmtTime(ev.end_at)}` : ""}
                            </span>
                            <h4 className="font-medium truncate">{ev.title}</h4>
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap text-[11px] text-muted-foreground">
                            <Badge
                              variant={ev.status === "scheduled" ? "default" : ev.status === "cancelled" ? "destructive" : "secondary"}
                              className="text-[10px]"
                            >
                              {STATUS_LABEL[ev.status] ?? ev.status}
                            </Badge>
                            {ev.channel_type && <Badge variant="outline" className="capitalize text-[10px]">{ev.channel_type}</Badge>}
                            {ev.meeting_enabled
                              ? <Badge variant="outline" className="text-[10px]"><Video className="w-3 h-3 mr-1" /> Online</Badge>
                              : <Badge variant="outline" className="text-[10px]"><MapPin className="w-3 h-3 mr-1" /> Presencial</Badge>}
                          </div>
                          <div className="mt-1.5 space-y-0.5 text-xs">
                            <div className="flex items-center gap-1.5 text-foreground/80">
                              <User2 className="w-3 h-3 text-muted-foreground" />
                              <span className="text-muted-foreground">Contato:</span>{" "}
                              <span className="font-medium">{cName ?? "Evento interno"}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-foreground/80">
                              <User2 className="w-3 h-3 text-muted-foreground" />
                              <span className="text-muted-foreground">Responsável:</span>{" "}
                              <span className="font-medium">{userLabel(ev.assigned_user_id)}</span>
                            </div>
                            {ev.location && (
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <MapPin className="w-3 h-3" /> <span className="truncate">{ev.location}</span>
                              </div>
                            )}
                            {ev.meeting_url && (
                              <a
                                href={ev.meeting_url} target="_blank" rel="noopener noreferrer"
                                className="text-primary hover:underline inline-block break-all"
                              >
                                {ev.meeting_url}
                              </a>
                            )}
                          </div>
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Ações do evento">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => setInfoEvent(ev)}>
                              <Info className="w-4 h-4 mr-2" /> Informações
                            </DropdownMenuItem>
                            {ev.status === "scheduled" && editable && (
                              <DropdownMenuItem
                                onClick={() => setRescheduleEvent({
                                  id: ev.id, title: ev.title, description: ev.description,
                                  start_at: ev.start_at, end_at: ev.end_at, location: ev.location,
                                  meeting_enabled: ev.meeting_enabled, meeting_url: ev.meeting_url,
                                  ticket_id: ev.ticket_id, contact_id: ev.contact_id,
                                  channel_id: ev.channel_id, channel_type: ev.channel_type,
                                  assigned_user_id: ev.assigned_user_id,
                                })}
                              >
                                <CalendarClock className="w-4 h-4 mr-2" /> Reagendar
                              </DropdownMenuItem>
                            )}
                            {ev.status === "scheduled" && editable && (
                              <DropdownMenuItem onClick={() => { setCancelEvent(ev); setCancelReason(""); }}>
                                <Ban className="w-4 h-4 mr-2" /> Cancelar
                              </DropdownMenuItem>
                            )}
                            {isAdmin && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteEvent(ev)}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" /> Excluir
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create new event */}
      <EventModal
        open={open}
        onOpenChange={setOpen}
        context={{ mode: "standalone" }}
        defaultDate={selectedDate}
        onCreated={() => qc.invalidateQueries({ queryKey: ["scheduled-events"] })}
      />

      {/* Reschedule */}
      <EventModal
        open={!!rescheduleEvent}
        onOpenChange={(v) => { if (!v) setRescheduleEvent(null); }}
        context={{
          mode: rescheduleEvent?.ticket_id ? "ticket" : "standalone",
          ticket_id: rescheduleEvent?.ticket_id ?? undefined,
          contact_id: rescheduleEvent?.contact_id ?? undefined,
          channel_id: rescheduleEvent?.channel_id ?? undefined,
          channel_type: rescheduleEvent?.channel_type ?? undefined,
        }}
        reschedule={rescheduleEvent}
        onCreated={() => qc.invalidateQueries({ queryKey: ["scheduled-events"] })}
      />

      {/* Info dialog */}
      <Dialog open={!!infoEvent} onOpenChange={(v) => { if (!v) setInfoEvent(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{infoEvent?.title}</DialogTitle>
            <DialogDescription>Informações do evento</DialogDescription>
          </DialogHeader>
          {infoEvent && (
            <div className="space-y-2 text-sm">
              {infoEvent.description && (
                <div>
                  <p className="text-xs text-muted-foreground">Descrição</p>
                  <p className="whitespace-pre-wrap">{infoEvent.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Início</p>
                  <p>{fmtDateTime(infoEvent.start_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Término</p>
                  <p>{infoEvent.end_at ? fmtDateTime(infoEvent.end_at) : "—"}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tipo</p>
                <p>{infoEvent.meeting_enabled ? "Online" : "Presencial"}</p>
              </div>
              {infoEvent.location && (
                <div>
                  <p className="text-xs text-muted-foreground">Local</p>
                  <p>{infoEvent.location}</p>
                </div>
              )}
              {infoEvent.meeting_url && (
                <div>
                  <p className="text-xs text-muted-foreground">Link da reunião</p>
                  <a href={infoEvent.meeting_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
                    {infoEvent.meeting_url}
                  </a>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Contato</p>
                  <p>{contactLabel(infoEvent) ?? "Evento interno"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Canal</p>
                  <p className="capitalize">{infoEvent.channel_type ?? "—"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Responsável</p>
                  <p>{userLabel(infoEvent.assigned_user_id)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Criado por</p>
                  <p>{userLabel(infoEvent.created_by)}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge variant={infoEvent.status === "scheduled" ? "default" : infoEvent.status === "cancelled" ? "destructive" : "secondary"}>
                  {STATUS_LABEL[infoEvent.status] ?? infoEvent.status}
                </Badge>
              </div>
              <div className="border-t pt-2 text-xs text-muted-foreground space-y-0.5">
                <p>Confirmação ao cliente: {infoEvent.send_confirmation ? "habilitada" : "desabilitada"}</p>
                <p>Lembrete 1h: {infoEvent.reminder_1h_enabled ? "habilitado" : "desabilitado"}</p>
                <p>Lembrete 5min: {infoEvent.reminder_5m_enabled ? "habilitado" : "desabilitado"}</p>
              </div>
              {infoEvent.status === "cancelled" && infoEvent.cancel_reason && (
                <div className="border-t pt-2">
                  <p className="text-xs text-muted-foreground">Motivo do cancelamento</p>
                  <p>{infoEvent.cancel_reason}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setInfoEvent(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel dialog */}
      <Dialog open={!!cancelEvent} onOpenChange={(v) => { if (!v && !cancelSubmitting) { setCancelEvent(null); setCancelReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar evento</DialogTitle>
            <DialogDescription>
              Informe o motivo do cancelamento. Lembretes pendentes serão cancelados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motivo *</Label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              placeholder="Ex.: cliente solicitou remarcar."
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setCancelEvent(null); setCancelReason(""); }} disabled={cancelSubmitting}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={confirmCancel} disabled={cancelSubmitting || !cancelReason.trim()}>
              {cancelSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={!!deleteEvent} onOpenChange={(v) => { if (!v && !deleteSubmitting) setDeleteEvent(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir evento</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir este evento? Esta ação é permanente e deve ser usada apenas em casos administrativos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteEvent(null)} disabled={deleteSubmitting}>Voltar</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteSubmitting}>
              {deleteSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
