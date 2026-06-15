import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, Send, Phone, MoreVertical, Check, CheckCheck, MessageSquare, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "@/hooks/use-toast";

type TicketStatus = "open" | "pending" | "closed";

interface TicketRow {
  id: string;
  company_id: string;
  contact_id: string;
  channel_id: string | null;
  status: TicketStatus;
  unread_count: number;
  last_message_at: string | null;
  subject: string | null;
  contact: { id: string; name: string | null; phone_number: string | null; avatar_url: string | null } | null;
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
  const { activeCompanyId } = useCompany();
  const [filter, setFilter] = useState<TicketStatus>("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const ticketsQuery = useQuery({
    queryKey: ["tickets", activeCompanyId, filter],
    enabled: !!activeCompanyId,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("id, company_id, contact_id, channel_id, status, unread_count, last_message_at, subject, contact:contacts(id, name, phone_number, avatar_url)")
        .eq("company_id", activeCompanyId!)
        .eq("status", filter)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as TicketRow[];
    },
  });

  const tickets = useMemo(() => {
    const list = ticketsQuery.data ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (t) =>
        (t.contact?.name || "").toLowerCase().includes(q) ||
        (t.contact?.phone_number || "").includes(q),
    );
  }, [ticketsQuery.data, search]);

  const selected = useMemo(
    () => tickets.find((t) => t.id === selectedId) ?? null,
    [tickets, selectedId],
  );

  // auto-select first ticket when list loads
  useEffect(() => {
    if (!selectedId && tickets.length > 0) setSelectedId(tickets[0].id);
  }, [tickets, selectedId]);

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

  return (
    <AppLayout title="Atendimentos">
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* List */}
        <div className="w-80 border-r flex flex-col bg-card flex-shrink-0">
          <div className="p-3 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar tickets..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 bg-secondary border-0"
              />
            </div>
            <div className="flex gap-1">
              {(["open", "pending", "closed"] as const).map((s) => (
                <Button
                  key={s}
                  variant={filter === s ? "default" : "ghost"}
                  size="sm"
                  className={`flex-1 text-xs h-8 ${filter === s ? "gradient-primary text-primary-foreground" : "text-muted-foreground"}`}
                  onClick={() => setFilter(s)}
                >
                  {s === "open" ? "Abertos" : s === "pending" ? "Pendentes" : "Fechados"}
                </Button>
              ))}
            </div>
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
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {t.contact?.phone_number || ""}
                      </p>
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
            <div className="h-14 flex items-center justify-between px-4 border-b bg-card">
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {initialsOf(selected.contact?.name, selected.contact?.phone_number)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-sm text-foreground">
                    {selected.contact?.name || selected.contact?.phone_number || "Sem nome"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selected.contact?.phone_number || "—"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="text-muted-foreground h-8 w-8">
                  <Phone className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="text-muted-foreground h-8 w-8">
                  <MoreVertical className="w-4 h-4" />
                </Button>
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
    </AppLayout>
  );
};

export default Tickets;
