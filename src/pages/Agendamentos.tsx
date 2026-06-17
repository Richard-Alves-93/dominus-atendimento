import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Calendar as CalendarIcon, Video, MapPin, Loader2, XCircle,
  User2, ChevronLeft, ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { EventModal } from "@/components/events/EventModal";
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

  const role = activeMembership?.role ?? "agent";
  const isMaster = profile?.is_master === true;
  const isAdmin = isMaster || ["owner", "admin"].includes(role);
  const isManager = role === "manager";

  // Range for the visible calendar grid (6 weeks)
  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay()); // back to Sunday
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
        .select("id, title, description, start_at, end_at, location, meeting_enabled, meeting_url, status, assigned_user_id, created_by, ticket_id, contact_id, channel_id, channel_type")
        .eq("company_id", activeCompanyId!)
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

  async function cancelEvent(id: string) {
    const { error } = await supabase
      .from("scheduled_events")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: user?.id ?? null })
      .eq("id", id);
    if (error) {
      toast({ title: "Não foi possível cancelar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Evento cancelado", description: "Mensagens pendentes vinculadas foram canceladas." });
    qc.invalidateQueries({ queryKey: ["scheduled-events"] });
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
                    <span className={cn(
                      "text-xs font-medium",
                      isToday && "text-primary",
                    )}>
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
                {selectedDayEvents.map((ev) => (
                  <Card key={ev.id} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono text-muted-foreground">
                            {fmtTime(ev.start_at)}{ev.end_at ? `–${fmtTime(ev.end_at)}` : ""}
                          </span>
                          <h4 className="font-medium truncate">{ev.title}</h4>
                        </div>
                        <div className="mt-1 flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                          <Badge
                            variant={ev.status === "scheduled" ? "default" : ev.status === "cancelled" ? "destructive" : "secondary"}
                            className="text-[10px]"
                          >
                            {STATUS_LABEL[ev.status] ?? ev.status}
                          </Badge>
                          {ev.channel_type && <Badge variant="outline" className="capitalize text-[10px]">{ev.channel_type}</Badge>}
                          {ev.meeting_enabled && <Badge variant="outline" className="text-[10px]"><Video className="w-3 h-3 mr-1" /> Online</Badge>}
                          {ev.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {ev.location}</span>}
                          <span className="flex items-center gap-1">
                            <User2 className="w-3 h-3" /> {ev.assigned_user_id === user?.id ? "Você" : "Outro"}
                          </span>
                        </div>
                        {ev.meeting_url && (
                          <a
                            href={ev.meeting_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline mt-1 inline-block break-all"
                          >
                            {ev.meeting_url}
                          </a>
                        )}
                      </div>
                      {ev.status === "scheduled" && (
                        <Button variant="ghost" size="icon" onClick={() => cancelEvent(ev.id)} aria-label="Cancelar evento">
                          <XCircle className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <EventModal
        open={open}
        onOpenChange={setOpen}
        context={{ mode: "standalone" }}
        defaultDate={selectedDate}
        onCreated={() => qc.invalidateQueries({ queryKey: ["scheduled-events"] })}
      />
    </AppLayout>
  );
}
