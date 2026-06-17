import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Calendar as CalendarIcon, Video, MapPin, Loader2, XCircle, User2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { EventModal } from "@/components/events/EventModal";
import { toast } from "@/hooks/use-toast";

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

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function Agendamentos() {
  const { activeCompanyId, activeMembership } = useCompany();
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<ScopeFilter>("mine");
  const [status, setStatus] = useState<StatusFilter>("scheduled");

  const role = activeMembership?.role ?? "agent";
  const isMaster = profile?.is_master === true;
  const isAdmin = isMaster || ["owner", "admin"].includes(role);
  const isManager = role === "manager";

  const eventsQuery = useQuery({
    queryKey: ["scheduled-events", activeCompanyId, scope, status, user?.id, role],
    enabled: !!activeCompanyId && !!user,
    queryFn: async (): Promise<EventRow[]> => {
      let q = supabase
        .from("scheduled_events")
        .select("id, title, description, start_at, end_at, location, meeting_enabled, meeting_url, status, assigned_user_id, created_by, ticket_id, contact_id, channel_id, channel_type")
        .eq("company_id", activeCompanyId!)
        .order("start_at", { ascending: true })
        .limit(200);

      if (status !== "all") q = q.eq("status", status);

      // Scope handling — RLS already filters; this narrows further when admin/manager picks "mine".
      if (scope === "mine") {
        q = q.eq("assigned_user_id", user!.id);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });

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

        {eventsQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>
        ) : (eventsQuery.data?.length ?? 0) === 0 ? (
          <Card className="p-10 text-center">
            <CalendarIcon className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhum evento encontrado.</p>
          </Card>
        ) : (
          <div className="grid gap-2">
            {eventsQuery.data!.map((ev) => (
              <Card key={ev.id} className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium truncate">{ev.title}</h3>
                    <Badge variant={ev.status === "scheduled" ? "default" : ev.status === "cancelled" ? "destructive" : "secondary"}>
                      {STATUS_LABEL[ev.status] ?? ev.status}
                    </Badge>
                    {ev.channel_type && <Badge variant="outline" className="capitalize">{ev.channel_type}</Badge>}
                    {ev.meeting_enabled && <Badge variant="outline"><Video className="w-3 h-3 mr-1" /> Online</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1"><CalendarIcon className="w-3 h-3" /> {fmtDate(ev.start_at)}{ev.end_at ? ` → ${fmtDate(ev.end_at)}` : ""}</span>
                    {ev.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {ev.location}</span>}
                    <span className="flex items-center gap-1"><User2 className="w-3 h-3" /> {ev.assigned_user_id === user?.id ? "Você" : "Outro responsável"}</span>
                  </div>
                  {ev.description && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{ev.description}</p>}
                  {ev.meeting_url && (
                    <a href={ev.meeting_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 inline-block break-all">
                      {ev.meeting_url}
                    </a>
                  )}
                </div>
                {ev.status === "scheduled" && (
                  <Button variant="ghost" size="sm" onClick={() => cancelEvent(ev.id)}>
                    <XCircle className="w-4 h-4 mr-1" /> Cancelar
                  </Button>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      <EventModal
        open={open}
        onOpenChange={setOpen}
        context={{ mode: "standalone" }}
        onCreated={() => qc.invalidateQueries({ queryKey: ["scheduled-events"] })}
      />
    </AppLayout>
  );
}
