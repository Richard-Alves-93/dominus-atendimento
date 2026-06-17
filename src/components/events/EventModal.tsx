import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CalendarPlus, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

export interface EventModalContext {
  mode: "ticket" | "standalone";
  ticket_id?: string;
  contact_id?: string;
  channel_id?: string;
  channel_type?: string | null;
  contactLabel?: string;
}

export interface RescheduleTarget {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  location: string | null;
  meeting_enabled: boolean;
  meeting_url: string | null;
  ticket_id: string | null;
  contact_id: string | null;
  channel_id: string | null;
  channel_type: string | null;
  assigned_user_id: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  context: EventModalContext;
  onCreated?: () => void;
  defaultDate?: string; // yyyy-mm-dd
  reschedule?: RescheduleTarget | null;
}

type ContactOpt = { id: string; name: string | null; phone_number: string | null };
type ChannelOpt = { id: string; name: string; channel_type: string; status: string };

export function EventModal({ open, onOpenChange, context, onCreated, defaultDate, reschedule }: Props) {
  const { activeCompanyId } = useCompany();
  const { user } = useAuth();
  const isTicketMode = context.mode === "ticket";
  const isEdit = !!reschedule;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [meetingEnabled, setMeetingEnabled] = useState(false);
  const [meetingUrl, setMeetingUrl] = useState("");
  const [sendConfirmation, setSendConfirmation] = useState(true);
  const [reminder1h, setReminder1h] = useState(true);
  const [reminder5m, setReminder5m] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // standalone-only
  const [contactId, setContactId] = useState<string>("");
  const [channelId, setChannelId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    if (reschedule) {
      const s = new Date(reschedule.start_at);
      const e = reschedule.end_at ? new Date(reschedule.end_at) : null;
      const pad = (n: number) => String(n).padStart(2, "0");
      setTitle(reschedule.title);
      setDescription(reschedule.description ?? "");
      setDate(`${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`);
      setStartTime(`${pad(s.getHours())}:${pad(s.getMinutes())}`);
      setEndTime(e ? `${pad(e.getHours())}:${pad(e.getMinutes())}` : "");
      setLocation(reschedule.location ?? "");
      setMeetingEnabled(reschedule.meeting_enabled);
      setMeetingUrl(reschedule.meeting_url ?? "");
      setContactId(reschedule.contact_id ?? "");
      setChannelId(reschedule.channel_id ?? "");
      return;
    }
    setTitle("");
    setDescription("");
    setDate(defaultDate ?? "");
    setStartTime("");
    setEndTime("");
    setLocation("");
    setMeetingEnabled(false);
    setMeetingUrl("");
    setSendConfirmation(true);
    setReminder1h(true);
    setReminder5m(true);
    setContactId("");
    setChannelId("");
  }, [open, defaultDate, reschedule]);

  // standalone: load contacts of company
  const contactsQuery = useQuery({
    queryKey: ["event-modal-contacts", activeCompanyId],
    enabled: open && !isTicketMode && !!activeCompanyId,
    queryFn: async (): Promise<ContactOpt[]> => {
      const { data } = await supabase
        .from("contacts")
        .select("id, name, phone_number")
        .eq("company_id", activeCompanyId!)
        .order("name", { ascending: true })
        .limit(200);
      return (data ?? []) as ContactOpt[];
    },
  });

  const channelsQuery = useQuery({
    queryKey: ["event-modal-channels", activeCompanyId],
    enabled: open && !isTicketMode && !!activeCompanyId,
    queryFn: async (): Promise<ChannelOpt[]> => {
      const { data } = await supabase
        .from("channels")
        .select("id, name, channel_type, status")
        .eq("company_id", activeCompanyId!)
        .eq("status", "connected");
      return (data ?? []) as ChannelOpt[];
    },
  });

  const hasContactContext = isTicketMode || !!contactId;
  const hasChannelContext = isTicketMode ? !!context.channel_id : !!channelId;
  const canSendMessages = hasContactContext && hasChannelContext;

  const selectedChannelType = useMemo(() => {
    if (isTicketMode) return context.channel_type ?? null;
    const ch = channelsQuery.data?.find((c) => c.id === channelId);
    return ch?.channel_type ?? null;
  }, [isTicketMode, channelId, channelsQuery.data, context.channel_type]);

  // Live conflict check
  const startIsoMemo = useMemo(() => {
    if (!date || !startTime) return null;
    const d = new Date(`${date}T${startTime}:00`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }, [date, startTime]);
  const endIsoMemo = useMemo(() => {
    if (!date || !endTime) return null;
    const d = new Date(`${date}T${endTime}:00`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }, [date, endTime]);

  const conflictQuery = useQuery({
    queryKey: ["event-conflict", activeCompanyId, user?.id, startIsoMemo, endIsoMemo],
    enabled: open && !!activeCompanyId && !!user?.id && !!startIsoMemo,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_schedule_conflict", {
        p_company_id: activeCompanyId!,
        p_assigned_user_id: user!.id,
        p_start_at: startIsoMemo!,
        p_end_at: endIsoMemo,
        p_ignore_event_id: null,
      });
      if (error) return false;
      return !!data;
    },
  });
  const hasConflict = conflictQuery.data === true;

  async function handleSubmit() {
    if (!activeCompanyId) return;
    if (!title.trim() || !date || !startTime) {
      toast({ title: "Campos obrigatórios", description: "Informe título, data e hora de início.", variant: "destructive" });
      return;
    }
    const startIso = new Date(`${date}T${startTime}:00`).toISOString();
    const endIso = endTime ? new Date(`${date}T${endTime}:00`).toISOString() : null;
    if (meetingEnabled && meetingUrl.trim()) {
      try { new URL(meetingUrl.trim()); }
      catch { toast({ title: "Link inválido", description: "Informe um link de reunião válido.", variant: "destructive" }); return; }
    }

    setSubmitting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Sessão expirada");
      const { data, error } = await supabase.functions.invoke("create-scheduled-event", {
        body: {
          company_id: activeCompanyId,
          ticket_id: isTicketMode ? context.ticket_id : null,
          contact_id: isTicketMode ? context.contact_id : (contactId || null),
          channel_id: isTicketMode ? context.channel_id : (channelId || null),
          assigned_user_id: user?.id ?? null,
          title: title.trim(),
          description: description.trim() || null,
          start_at: startIso,
          end_at: endIso,
          location: location.trim() || null,
          meeting_enabled: meetingEnabled,
          meeting_url: meetingEnabled ? (meetingUrl.trim() || null) : null,
          send_confirmation: canSendMessages && sendConfirmation,
          reminder_1h_enabled: canSendMessages && reminder1h,
          reminder_5m_enabled: canSendMessages && reminder5m,
        },
      });
      if (error) {
        // FunctionsHttpError carries the response; try to extract structured body
        const ctx = (error as any)?.context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const body = await ctx.json();
            if (body?.code === "SCHEDULE_CONFLICT" || body?.error?.includes?.("agendamento nesse horário")) {
              throw new Error(body.error);
            }
            if (body?.error) throw new Error(body.error);
          } catch (parseErr: any) {
            if (parseErr?.message) throw parseErr;
          }
        }
        throw error;
      }
      if (data?.ok === false) throw new Error(data.error ?? "Falha ao criar evento");
      toast({ title: "Evento criado", description: title.trim() });
      onCreated?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Não foi possível criar o evento", description: e?.message ?? "Erro desconhecido", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="w-5 h-5 text-primary" /> Novo evento
          </DialogTitle>
          <DialogDescription>
            {isTicketMode
              ? `Evento vinculado ao atendimento${context.contactLabel ? ` com ${context.contactLabel}` : ""}.`
              : "Crie um evento pessoal ou vinculado a um contato."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label>Título *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reunião com cliente" />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Detalhes opcionais" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Data *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Início *</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <Label>Término</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Local</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Endereço, sala ou link" />
          </div>

          {!isTicketMode && (
            <>
              <div>
                <Label>Contato (opcional)</Label>
                <Select value={contactId || "_none"} onValueChange={(v) => setContactId(v === "_none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Evento pessoal/interno" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Sem contato (interno)</SelectItem>
                    {contactsQuery.data?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name ?? c.phone_number ?? c.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {contactId && (
                <div>
                  <Label>Canal de envio</Label>
                  <Select value={channelId || "_none"} onValueChange={(v) => setChannelId(v === "_none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione um canal conectado" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Não enviar mensagens</SelectItem>
                      {channelsQuery.data?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name} · {c.channel_type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedChannelType && selectedChannelType !== "whatsapp" && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Envio automático para {selectedChannelType} ainda não está disponível. Será liberado em breve.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          <div className="border-t pt-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="flex items-center gap-2"><Video className="w-4 h-4" /> Adicionar reunião online</Label>
                <p className="text-[11px] text-muted-foreground">Inclua um link de videoconferência neste evento.</p>
              </div>
              <Switch checked={meetingEnabled} onCheckedChange={setMeetingEnabled} />
            </div>
            {meetingEnabled && (
              <>
                <Input
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                  placeholder="https://meet.google.com/..."
                />
                <p className="text-[11px] text-muted-foreground">
                  A geração automática de Google Meet será liberada após conectar sua conta Google em Conexões. Por enquanto, informe o link manualmente.
                </p>
              </>
            )}
          </div>

          {canSendMessages && (
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mensagens automáticas</p>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Enviar confirmação ao cliente</Label>
                <Switch checked={sendConfirmation} onCheckedChange={setSendConfirmation} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Lembrete 1 hora antes</Label>
                <Switch checked={reminder1h} onCheckedChange={setReminder1h} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Lembrete 5 minutos antes</Label>
                <Switch checked={reminder5m} onCheckedChange={setReminder5m} />
              </div>
            </div>
          )}

          {hasConflict && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 text-destructive text-xs p-2">
              Este responsável já possui um agendamento nesse horário.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting || hasConflict}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Criar evento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
