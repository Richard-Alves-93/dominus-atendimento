import { ArrowLeft, Filter, Loader2, Send, Check, CheckCheck, AlertCircle, MoreVertical, RotateCcw, Clock, CheckCircle2, Building2, UserPlus, Copy } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MobileFilterChips } from "@/components/mobile/MobileFilterChips";
import { MobileCompactSidebar } from "@/components/mobile/MobileCompactSidebar";
import { MediaContent } from "@/features/tickets/MediaContent";

// Fase C/D/E.1 — Shell mobile + render visual read-only completo.
// Continua sem duplicar regra de negócio: recebe estado/handlers via props.

type AnyTicket = {
  id: string;
  status: string;
  unread_count: number;
  last_message_at: string | null;
  department_id: string | null;
  protocol_number?: string | null;
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
  status?: string | null;
  delivery_status?: string | null;
  failure_reason?: string | null;
  is_edited?: boolean | null;
  edited_at?: string | null;
  reply_to_message_id?: string | null;
  reply_to_preview?: string | null;
  reply_to_sender_name?: string | null;
  reply_to_message_type?: string | null;
  media_mime_type?: string | null;
  media_file_name?: string | null;
  media_size?: number | null;
  media_duration?: number | null;
  media_caption?: string | null;
  media_storage_path?: string | null;
  media_url?: string | null;
  _optimistic?: boolean;
};

type ReactionRow = { id: string; message_id: string; user_id: string; emoji: string };

type AnyDept = { id: string; name: string; status: string };

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
  activeDepts: AnyDept[];
  deptFilter: string;
  setDeptFilter: (id: string) => void;
  // E.1 — read-only extras
  reactionsByMsg?: Map<string, ReactionRow[]>;
  // F.1 — ações do atendimento (handlers/permissions do desktop)
  canEditSelected?: boolean;
  canAcceptSelected?: boolean;
  canTakeOverSelected?: boolean;
  acceptLoading?: boolean;
  onAccept?: () => void;
  onTakeOver?: () => void;
  onChangeStatus?: (status: "open" | "pending" | "closed") => void;
  onOpenAssignDept?: () => void;
  onCopyProtocol?: () => void;
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

function firstName(name?: string | null, phone?: string | null) {
  const s = (name || phone || "").trim();
  if (!s) return "Sem nome";
  return s.split(/\s+/)[0].slice(0, 14);
}

function CheckIcon({ m }: { m: AnyMessage }) {
  const ds = m._optimistic
    ? (m.status === "error" ? "failed" : "sending")
    : (m.delivery_status || m.status || "sent");
  if (ds === "failed") return <AlertCircle className="w-3.5 h-3.5 text-destructive" aria-label="Falhou" />;
  if (ds === "read") return <CheckCheck className="w-3.5 h-3.5 text-sky-500" aria-label="Lida" />;
  if (ds === "sending") return <Check className="w-3.5 h-3.5 opacity-60" aria-label="Enviando" />;
  if (ds === "delivered") return <CheckCheck className="w-3.5 h-3.5 opacity-80" aria-label="Entregue" />;
  return <CheckCheck className="w-3.5 h-3.5 opacity-80" aria-label="Enviada" />;
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
    activeDepts,
    deptFilter,
    setDeptFilter,
    reactionsByMsg,
    canEditSelected = false,
    canAcceptSelected = false,
    canTakeOverSelected = false,
    acceptLoading = false,
    onAccept,
    onTakeOver,
    onChangeStatus,
    onOpenAssignDept,
    onCopyProtocol,
  } = props;

  const filterOptions = [
    { value: "open" as const, label: "Abertos" },
    { value: "pending" as const, label: "Pendentes" },
    { value: "closed" as const, label: "Fechados" },
    ...(canSeeGeneralQueue ? [{ value: "fila" as const, label: "Fila" }] : []),
    { value: "meus" as const, label: "Meus" },
  ];

  // ───────────────────── Lista de tickets ─────────────────────
  if (!selectedId) {
    const deptLabel =
      deptFilter === "all"
        ? null
        : activeDepts.find((d) => d.id === deptFilter)?.name ?? null;

    return (
      <AppLayout title="Atendimentos" mobileFullScreen>
        <div className="flex h-svh w-full max-w-full min-w-0 overflow-hidden bg-background">
          <MobileCompactSidebar />
          <div className="flex flex-1 min-w-0 max-w-full flex-col overflow-x-hidden bg-background">

          <div className="flex h-12 shrink-0 items-center justify-between border-b bg-background px-3 min-w-0 max-w-full">
            <h1 className="text-base font-semibold text-foreground truncate">Atendimentos</h1>
            <span className="ml-2 shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {tickets.length}
            </span>
          </div>
          <div className="p-3 space-y-2 border-b min-w-0 max-w-full">
            <Input
              placeholder="Buscar atendimentos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 bg-secondary border-0"
            />
            <div className="flex items-center gap-1.5 min-w-0 max-w-full">
              <MobileFilterChips
                value={filter}
                onChange={setFilter}
                options={filterOptions}
                ariaLabel="Filtro de atendimentos"
                className="flex-1"
              />
              {activeDepts.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className={`shrink-0 inline-flex items-center gap-1 text-xs px-2.5 h-7 rounded-full border transition ${
                        deptFilter !== "all"
                          ? "bg-primary/15 text-primary border-primary/30"
                          : "bg-muted text-muted-foreground border-transparent"
                      }`}
                      aria-label="Filtrar por setor"
                    >
                      <Filter className="w-3 h-3" />
                      <span className="max-w-[80px] truncate">
                        {deptLabel ?? "Setor"}
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-56 p-1">
                    <button
                      onClick={() => setDeptFilter("all")}
                      className={`w-full text-left text-sm px-3 py-2 rounded-md hover:bg-muted ${
                        deptFilter === "all" ? "bg-muted font-medium" : ""
                      }`}
                    >
                      Todos os setores
                    </button>
                    {activeDepts.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => setDeptFilter(d.id)}
                        className={`w-full text-left text-sm px-3 py-2 rounded-md hover:bg-muted ${
                          deptFilter === d.id ? "bg-muted font-medium" : ""
                        }`}
                      >
                        {d.name}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>

            <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
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
        </div>
      </AppLayout>
    );
  }

  // ───────────────────── Conversa ─────────────────────
  const name = selected?.contact?.name || selected?.contact?.phone_number || "Atendimento";
  const phone = selected?.contact?.phone_number || "";

  // Quick-switch: top 6 tickets para troca rápida (inclui o atual).
  const quickStrip = tickets.slice(0, 6);

  const MEDIA_TYPES = ["image", "audio", "video", "document", "sticker"];

  return (
    <AppLayout title="Atendimentos" mobileFullScreen>
      <div className="flex h-svh w-full max-w-full min-w-0 overflow-hidden bg-[hsl(var(--muted))]/30">
        <MobileCompactSidebar />
        <div className="flex flex-1 min-w-0 max-w-full flex-col overflow-x-hidden bg-[hsl(var(--muted))]/30">
        {/* Header */}
        <div className="h-14 px-2 border-b bg-background flex items-center gap-2 shrink-0 min-w-0 max-w-full">
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
          {canAcceptSelected && (
            <Button
              size="sm"
              className="h-8 px-2.5 text-[11px] gradient-primary text-primary-foreground shrink-0"
              onClick={() => onAccept?.()}
              disabled={acceptLoading}
              aria-label="Aceitar atendimento"
            >
              {acceptLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Aceitar"}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" aria-label="Mais opções">
                <MoreVertical className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {canTakeOverSelected && (
                <DropdownMenuItem onClick={() => onTakeOver?.()}>
                  <UserPlus className="w-4 h-4 mr-2" /> Assumir atendimento
                </DropdownMenuItem>
              )}
              {onOpenAssignDept && (
                <DropdownMenuItem onClick={() => onOpenAssignDept()} disabled={!canEditSelected}>
                  <Building2 className="w-4 h-4 mr-2" />
                  {selected?.department_id ? "Transferir setor" : "Definir setor"}
                </DropdownMenuItem>
              )}
              {(canTakeOverSelected || onOpenAssignDept) && <DropdownMenuSeparator />}
              {selected?.status !== "open" && (
                <DropdownMenuItem onClick={() => onChangeStatus?.("open")} disabled={!canEditSelected}>
                  <RotateCcw className="w-4 h-4 mr-2" /> Reabrir atendimento
                </DropdownMenuItem>
              )}
              {selected?.status !== "pending" && (
                <DropdownMenuItem onClick={() => onChangeStatus?.("pending")} disabled={!canEditSelected}>
                  <Clock className="w-4 h-4 mr-2" /> Marcar como pendente
                </DropdownMenuItem>
              )}
              {selected?.status !== "closed" && (
                <DropdownMenuItem onClick={() => onChangeStatus?.("closed")} disabled={!canEditSelected}>
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Fechar atendimento
                </DropdownMenuItem>
              )}
              {selected?.protocol_number && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onCopyProtocol?.()}>
                    <Copy className="w-4 h-4 mr-2" /> Copiar protocolo
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Quick-switch carousel */}
        {quickStrip.length > 1 && (
          <div className="border-b bg-background px-2 py-2 flex gap-2 overflow-x-auto scrollbar-thin shrink-0 min-w-0 max-w-full">
            {quickStrip.map((t) => {
              const isActive = t.id === selectedId;
              const tName = firstName(t.contact?.name, t.contact?.phone_number);
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`shrink-0 flex flex-col items-center gap-1 px-1.5 py-1 rounded-md min-w-[56px] ${
                    isActive ? "bg-success/15" : ""
                  }`}
                  aria-pressed={isActive}
                >
                  <div className="relative">
                    <div className={`h-9 w-9 rounded-full overflow-hidden bg-primary/15 text-primary flex items-center justify-center text-[10px] font-semibold ${
                      isActive ? "ring-2 ring-success" : ""
                    }`}>
                      {t.contact?.avatar_url ? (
                        <img
                          src={t.contact.avatar_url}
                          alt={tName}
                          className="h-9 w-9 rounded-full object-cover"
                        />
                      ) : (
                        initials(t.contact?.name, t.contact?.phone_number)
                      )}
                    </div>
                    {t.unread_count > 0 && (
                      <span className="absolute -top-1 -right-1 text-[8.5px] min-w-[14px] h-[14px] px-1 rounded-full bg-success text-white flex items-center justify-center">
                        {t.unread_count}
                      </span>
                    )}
                  </div>
                  <span className={`text-[10px] truncate max-w-[56px] ${isActive ? "font-semibold" : "text-muted-foreground"}`}>
                    {tName}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Mensagens */}
        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-2">
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

              const isMedia = MEDIA_TYPES.includes(m.msg_type);
              const caption = m.media_caption ?? (isMedia ? m.body : null);
              const hasReply = !!(m.reply_to_message_id || m.reply_to_preview);
              const reactions = reactionsByMsg?.get(m.id) ?? [];
              const reactionCounts = reactions.reduce<Record<string, number>>((acc, r) => {
                acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
                return acc;
              }, {});

              return (
                <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                  <div className="relative max-w-[82%] min-w-0">
                    <div
                      className={`rounded-2xl px-3 py-2 text-[13px] border shadow-sm ${
                        isMine
                          ? "bg-success/15 border-success/20 text-foreground rounded-tr-sm"
                          : "bg-background border-border/60 text-foreground rounded-tl-sm"
                      } ${m.status === "error" ? "ring-1 ring-destructive" : ""}`}
                    >
                      {hasReply && (
                        <div
                          className={`mb-1.5 rounded-md px-2 py-1 border-l-2 ${
                            isMine
                              ? "bg-success/10 border-success/60"
                              : "bg-muted border-primary/50"
                          }`}
                        >
                          <div className={`text-[11px] font-medium ${isMine ? "text-success" : "text-primary"}`}>
                            {m.reply_to_sender_name || "Mensagem"}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {m.reply_to_preview || "Mensagem original indisponível"}
                          </div>
                        </div>
                      )}

                      {isMedia && (
                        <div className="mb-1 min-w-0">
                          <MediaContent m={m} onMime={(mime) => mime?.split("/")[1]?.toUpperCase() ?? ""} />
                        </div>
                      )}

                      {(isMedia ? caption : m.body) ? (
                        <div className="whitespace-pre-wrap break-words">
                          {isMedia ? caption : m.body}
                        </div>
                      ) : isMedia ? null : (
                        <div className="text-xs text-muted-foreground italic">[{m.msg_type}]</div>
                      )}

                      <div className="flex items-center justify-end gap-1 mt-1 text-muted-foreground">
                        {m.is_edited && (
                          <span
                            className="text-[10px] italic opacity-70"
                            title={m.edited_at ? `Editada em ${fmtTime(m.edited_at)}` : "Editada"}
                          >
                            Editada
                          </span>
                        )}
                        <span className="text-[10px]">{fmtTime(m.sent_at || m.created_at)}</span>
                        {isMine && <CheckIcon m={m} />}
                      </div>
                    </div>

                    {/* Reactions badge (read-only) */}
                    {Object.keys(reactionCounts).length > 0 && (
                      <div
                        className={`mt-0.5 flex gap-1 flex-wrap ${isMine ? "justify-end" : "justify-start"}`}
                      >
                        {Object.entries(reactionCounts).map(([emoji, count]) => (
                          <span
                            key={emoji}
                            className="inline-flex items-center gap-0.5 text-[11px] bg-background border border-border/60 rounded-full px-1.5 py-0.5 shadow-sm"
                          >
                            <span>{emoji}</span>
                            {count > 1 && <span className="text-muted-foreground">{count}</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Composer mínimo (apenas texto nesta fase) */}
        <div className="border-t bg-background px-2 py-2 flex items-end gap-2 shrink-0 w-full max-w-full min-w-0">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Digite..."
            rows={1}
            className="flex-1 min-w-0 min-h-[40px] max-h-[120px] resize-none rounded-2xl bg-muted border-0 px-3 py-2 text-sm"
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
      </div>
    </AppLayout>
  );
}
