import { ArrowLeft, Loader2, Send } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// Fase B — Shell mobile mínimo.
// Não duplica regra de negócio: recebe via props o estado/handlers já
// existentes no TicketsDesktopLayout (ticketsQuery, messagesQuery, selectedId,
// setSelectedId, text, setText, handleSend, filter, setFilter, etc.) e apenas
// reembala num shell adequado a telas pequenas.
//
// Funcionalidades não implementadas nesta fase (virão nas Fases C–E):
//   sidebar compacta, carrossel, mídias, anexos, gravação de áudio, reply,
//   reações, mensagens rápidas, transferência, assumir, refinamentos visuais.
// Em todos esses casos o usuário ainda pode usar o desktop ou aguardar fases
// seguintes. Esta fase entrega: listar, abrir, voltar, ler mensagens e enviar
// texto puro.

type AnyTicket = {
  id: string;
  status: string;
  unread_count: number;
  last_message_at: string | null;
  contact: { id: string; name: string | null; phone_number: string | null; avatar_url: string | null } | null;
  department: { id: string; name: string } | null;
  assignee?: { id: string; full_name: string | null; email: string | null } | null;
};

type AnyMessage = {
  id: string;
  from_me: boolean;
  body: string | null;
  msg_type: string;
  sent_at: string;
  created_at: string;
  source?: string | null;
};

type ListFilter = "open" | "pending" | "closed" | "todos" | "fila" | "meus";

interface Props {
  tickets: AnyTicket[];
  ticketsLoading: boolean;
  ticketsError: boolean;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  selected: AnyTicket | null;
  visibleMessages: AnyMessage[];
  messagesLoading: boolean;
  text: string;
  setText: (v: string) => void;
  handleSend: () => void;
  filter: ListFilter;
  setFilter: (f: ListFilter) => void;
  search: string;
  setSearch: (s: string) => void;
  canSeeGeneralQueue: boolean;
}

function initials(name?: string | null, phone?: string | null) {
  const s = (name || phone || "?").trim();
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

function fmtTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString();
}

export default function TicketsMobileLayout(props: Props) {
  const {
    tickets,
    ticketsLoading,
    ticketsError,
    selectedId,
    setSelectedId,
    selected,
    visibleMessages,
    messagesLoading,
    text,
    setText,
    handleSend,
    filter,
    setFilter,
    search,
    setSearch,
    canSeeGeneralQueue,
  } = props;

  // ───────────────────── Lista de tickets ─────────────────────
  if (!selectedId) {
    return (
      <AppLayout title="Atendimentos">
        <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-background">
          <div className="p-3 space-y-2 border-b">
            <Input
              placeholder="Buscar atendimentos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 bg-secondary border-0"
            />
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {(
                [
                  ["open", "Abertos"],
                  ["pending", "Pendentes"],
                  ["closed", "Fechados"],
                  ...(canSeeGeneralQueue ? [["fila", "Fila"] as const] : []),
                  ["meus", "Meus"],
                ] as Array<readonly [ListFilter, string]>
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={`shrink-0 text-xs px-3 h-7 rounded-full border transition ${
                    filter === k
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-muted-foreground border-transparent"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {ticketsLoading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Carregando...
              </div>
            ) : ticketsError ? (
              <div className="p-6 text-sm text-destructive">Erro ao carregar atendimentos.</div>
            ) : tickets.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">
                Nenhum atendimento encontrado.
              </div>
            ) : (
              tickets.map((t) => {
                const name = t.contact?.name || t.contact?.phone_number || "Sem nome";
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className="w-full text-left px-3 py-3 border-b flex gap-3 items-center hover:bg-muted/40 active:bg-muted/60"
                  >
                    <div className="h-11 w-11 rounded-full overflow-hidden bg-primary/15 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                      {t.contact?.avatar_url ? (
                        <img
                          src={t.contact.avatar_url}
                          alt={name}
                          className="h-11 w-11 rounded-full object-cover"
                        />
                      ) : (
                        initials(t.contact?.name, t.contact?.phone_number)
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate">{name}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {fmtTime(t.last_message_at)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground truncate">
                          {t.department?.name || "Sem setor"}
                          {t.assignee ? ` · ${t.assignee.full_name || "Atendente"}` : ""}
                        </span>
                        {t.unread_count > 0 && (
                          <span className="text-[10px] min-w-[18px] h-[18px] px-1.5 rounded-full bg-success text-white flex items-center justify-center shrink-0">
                            {t.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  // ───────────────────── Conversa ─────────────────────
  const name = selected?.contact?.name || selected?.contact?.phone_number || "Atendimento";
  const phone = selected?.contact?.phone_number || "";

  return (
    <AppLayout title="Atendimentos">
      <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-[hsl(var(--muted))]/30">
        {/* Header */}
        <div className="h-14 px-2 border-b bg-background flex items-center gap-2 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 shrink-0"
            onClick={() => setSelectedId(null)}
            aria-label="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="h-9 w-9 rounded-full overflow-hidden bg-primary/15 text-primary flex items-center justify-center text-[11px] font-semibold shrink-0">
            {selected?.contact?.avatar_url ? (
              <img
                src={selected.contact.avatar_url}
                alt={name}
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              initials(selected?.contact?.name, selected?.contact?.phone_number)
            )}
          </div>
          <div className="leading-tight min-w-0 flex-1">
            <div className="text-sm font-semibold truncate">{name}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {phone}
              {selected?.department?.name ? ` · ${selected.department.name}` : ""}
              {selected?.assignee?.full_name ? ` · ${selected.assignee.full_name}` : ""}
            </div>
          </div>
          {selected?.status && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success font-medium shrink-0">
              {selected.status === "open" ? "Aberto" : selected.status === "pending" ? "Pendente" : "Fechado"}
            </span>
          )}
        </div>

        {/* Mensagens */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {messagesLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Carregando mensagens...
            </div>
          ) : visibleMessages.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-6">
              Sem mensagens ainda.
            </div>
          ) : (
            visibleMessages.map((m) => {
              const isMine = m.from_me;
              const isSystem = m.source === "system";
              if (isSystem) {
                return (
                  <div key={m.id} className="flex justify-center">
                    <div className="text-[11px] text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-full">
                      {m.body}
                    </div>
                  </div>
                );
              }
              return (
                <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-[13px] shadow-card border ${
                      isMine
                        ? "bg-success/15 border-success/20 rounded-tr-sm"
                        : "bg-background rounded-tl-sm"
                    }`}
                  >
                    {m.body ? (
                      <div className="whitespace-pre-wrap break-words">{m.body}</div>
                    ) : (
                      <div className="text-xs text-muted-foreground italic">
                        [mídia — abra no desktop nesta fase]
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground text-right mt-0.5">
                      {fmtTime(m.sent_at || m.created_at)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Composer mínimo (apenas texto nesta fase) */}
        <div className="border-t bg-background px-2 py-2 flex items-end gap-2 shrink-0">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Digite..."
            rows={1}
            className="min-h-[40px] max-h-[120px] resize-none rounded-2xl bg-muted border-0 px-3 py-2 text-sm"
          />
          <Button
            size="icon"
            className="h-10 w-10 rounded-full gradient-primary text-primary-foreground shrink-0"
            onClick={handleSend}
            disabled={!text.trim()}
            aria-label="Enviar"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
