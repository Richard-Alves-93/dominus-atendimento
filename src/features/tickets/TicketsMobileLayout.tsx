import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Filter,
  Loader2,
  Send,
  Check,
  CheckCheck,
  AlertCircle,
  MoreVertical,
  RotateCcw,
  Clock,
  CheckCircle2,
  Building2,
  UserPlus,
  Copy,
  Plus,
  X,
  Mic,
  Trash2,
  FileText,
  Image as ImageIcon,
  Camera,
  Music,
  User as UserIcon,
  BarChart3,
  CalendarPlus,
  CornerUpLeft,
  Smile,
  Forward,
  Pin,
  Star,
  SquareCheck,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
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
import { QuickRepliesPopover } from "@/components/QuickRepliesPopover";

const ATTACH_DOC_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.odt,.ods,.odp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv";

function formatRecTime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

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
  // F.2 — composer mobile (reusa handlers do desktop)
  onFileSelected?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  replyPreview?: { sender: string; preview: string } | null;
  onCancelReply?: () => void;
  onOpenEvent?: () => void;
  onShowComingSoon?: (label: string) => void;
  isRecording?: boolean;
  recSeconds?: number;
  onStartRecording?: () => void;
  onCancelRecording?: () => void;
  onStopAndSendRecording?: () => void;
  // F.3 — ações de mensagem mobile
  profileId?: string | null;
  onToggleReaction?: (m: AnyMessage, emoji: string) => void | Promise<void>;
  onCopyMessage?: (m: AnyMessage) => void | Promise<void>;
  onReplyMessage?: (m: AnyMessage) => void;
  onComingSoonAction?: (label: string) => void;
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
    onFileSelected,
    replyPreview,
    onCancelReply,
    onOpenEvent,
    onShowComingSoon,
    isRecording = false,
    recSeconds = 0,
    onStartRecording,
    onCancelRecording,
    onStopAndSendRecording,
    profileId = null,
    onToggleReaction,
    onCopyMessage,
    onReplyMessage,
    onComingSoonAction,
  } = props;

  // F.3 — long-press → bottom sheet de ações da mensagem
  const [actionMsg, setActionMsg] = useState<AnyMessage | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);
  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };
  const startLongPress = (m: AnyMessage) => {
    if (m._optimistic || m.source === "system") return;
    clearLongPress();
    longPressFiredRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressFiredRef.current = true;
      setActionMsg(m);
      try { (navigator as any).vibrate?.(20); } catch { /* noop */ }
    }, 450);
  };
  const closeActionSheet = () => setActionMsg(null);
  const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];


  const documentInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // F.2-fix #13 / F.3-fix #15 — scroll robusto para o fim no mobile.
  // Dispara em: troca de conversa, mudança na quantidade ou no id da última
  // mensagem (cobre status sending→sent), e via ResizeObserver quando mídias
  // terminam de carregar e alteram a altura da lista.
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const lastMessageId = visibleMessages.length
    ? visibleMessages[visibleMessages.length - 1].id
    : null;

  const scrollToBottom = () => {
    const c = messagesContainerRef.current;
    if (!c) return;
    requestAnimationFrame(() => {
      c.scrollTop = c.scrollHeight;
      requestAnimationFrame(() => {
        c.scrollTop = c.scrollHeight;
        messagesEndRef.current?.scrollIntoView({ block: "end" });
      });
    });
  };

  useEffect(() => {
    if (!selectedId) return;
    scrollToBottom();
    // Re-tenta após render de mídias/imagens (cobre conversa longa).
    const t1 = window.setTimeout(scrollToBottom, 120);
    const t2 = window.setTimeout(scrollToBottom, 400);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [selectedId, visibleMessages.length, lastMessageId, messagesLoading]);

  // ResizeObserver: quando imagens/áudios carregam, a altura da lista cresce —
  // mantém o scroll colado no fim se o usuário ainda estiver perto do fim.
  useEffect(() => {
    const c = messagesContainerRef.current;
    if (!c || typeof ResizeObserver === "undefined") return;
    let prevHeight = c.scrollHeight;
    const ro = new ResizeObserver(() => {
      const nearBottom =
        c.scrollHeight - c.scrollTop - c.clientHeight < 160;
      if (c.scrollHeight > prevHeight && nearBottom) {
        c.scrollTop = c.scrollHeight;
      }
      prevHeight = c.scrollHeight;
    });
    ro.observe(c);
    return () => ro.disconnect();
  }, [selectedId]);


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
        <div ref={messagesContainerRef} className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-2">
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
              const myReactionEmoji = profileId
                ? reactions.find((r) => r.user_id === profileId)?.emoji
                : undefined;

              return (
                <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                  <div className="relative max-w-[82%] min-w-0">
                    <div
                      role="button"
                      tabIndex={0}
                      onTouchStart={() => startLongPress(m)}
                      onTouchEnd={clearLongPress}
                      onTouchMove={clearLongPress}
                      onTouchCancel={clearLongPress}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (m._optimistic) return;
                        setActionMsg(m);
                      }}
                      className={`select-none rounded-2xl px-3 py-2 text-[13px] border shadow-sm ${
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
          <div ref={messagesEndRef} aria-hidden="true" />
        </div>


        {/* Composer mobile (F.2) — +menu, reply preview, quick replies, mic↔send */}
        <div className="border-t bg-background px-2 py-2 flex flex-col gap-1.5 shrink-0 w-full max-w-full min-w-0">
          {replyPreview && (
            <div className="flex items-start gap-2 rounded-md border-l-2 border-primary/60 bg-muted/60 px-2.5 py-1.5 min-w-0">
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-primary truncate">
                  Respondendo {replyPreview.sender}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {replyPreview.preview}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => onCancelReply?.()}
                aria-label="Cancelar resposta"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

          {/* Hidden file inputs — usam handleFileSelected do desktop via prop */}
          <input ref={documentInputRef} type="file" accept={ATTACH_DOC_ACCEPT} className="hidden" onChange={onFileSelected} />
          <input ref={mediaInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={onFileSelected} />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            {...({ capture: "environment" } as any)}
            className="hidden"
            onChange={onFileSelected}
          />
          <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={onFileSelected} />

          {isRecording ? (
            <div className="flex items-center gap-2 w-full min-w-0">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full shrink-0 text-destructive"
                onClick={() => onCancelRecording?.()}
                aria-label="Cancelar gravação"
              >
                <Trash2 className="w-5 h-5" />
              </Button>
              <div className="flex-1 h-10 rounded-full bg-secondary px-3 flex items-center gap-2 text-sm min-w-0">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-destructive animate-pulse shrink-0" />
                <span className="text-muted-foreground truncate">Gravando…</span>
                <span className="ml-auto tabular-nums font-medium">{formatRecTime(recSeconds)}</span>
              </div>
              <Button
                type="button"
                onClick={() => onStopAndSendRecording?.()}
                size="icon"
                className="gradient-primary text-primary-foreground h-10 w-10 rounded-full shrink-0"
                aria-label="Enviar gravação"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-end gap-1.5 w-full min-w-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-full shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label="Anexar"
                    disabled={!onFileSelected}
                  >
                    <Plus className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-56">
                  <DropdownMenuItem onClick={() => documentInputRef.current?.click()}>
                    <FileText className="w-4 h-4 mr-2" /> Documento
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => mediaInputRef.current?.click()}>
                    <ImageIcon className="w-4 h-4 mr-2" /> Fotos e vídeos
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => cameraInputRef.current?.click()}>
                    <Camera className="w-4 h-4 mr-2" /> Câmera
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => audioInputRef.current?.click()}>
                    <Music className="w-4 h-4 mr-2" /> Áudio
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onShowComingSoon?.("Contato")}>
                    <UserIcon className="w-4 h-4 mr-2" /> Contato
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onShowComingSoon?.("Enquete")}>
                    <BarChart3 className="w-4 h-4 mr-2" /> Enquete
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onOpenEvent?.()} disabled={!selected || !onOpenEvent}>
                    <CalendarPlus className="w-4 h-4 mr-2" /> Evento
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <QuickRepliesPopover
                disabled={!selected}
                contactName={selected?.contact?.name ?? null}
                protocol={selected?.protocol_number ?? null}
                onInsert={(snippet) =>
                  setText(text.trim().length === 0 ? snippet : `${text}\n${snippet}`)
                }
              />

              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Digite..."
                rows={1}
                className="flex-1 min-w-0 min-h-[40px] max-h-[120px] resize-none rounded-2xl bg-secondary border-0 px-3 py-2 text-sm"
              />

              {text.trim().length === 0 ? (
                <Button
                  type="button"
                  onClick={() => onStartRecording?.()}
                  size="icon"
                  className="gradient-primary text-primary-foreground h-10 w-10 rounded-full shrink-0"
                  aria-label="Gravar áudio"
                  disabled={!onStartRecording}
                >
                  <Mic className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  onClick={handleSend}
                  size="icon"
                  className="gradient-primary text-primary-foreground h-10 w-10 rounded-full shrink-0"
                  aria-label="Enviar"
                >
                  <Send className="w-4 h-4" />
                </Button>
              )}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* F.3 — Bottom sheet de ações da mensagem (long-press) */}
      <Sheet open={!!actionMsg} onOpenChange={(o) => { if (!o) closeActionSheet(); }}>
        <SheetContent
          side="bottom"
          className="p-0 rounded-t-2xl max-h-[80vh] overflow-y-auto"
        >
          {actionMsg && (() => {
            const myReaction = (reactionsByMsg?.get(actionMsg.id) ?? []).find((r) => r.user_id === profileId)?.emoji;
            const showComing = (label: string) =>
              (onComingSoonAction ?? onShowComingSoon)?.(label);
            return (
              <div className="px-3 pt-3 pb-4 flex flex-col gap-2">
                {/* Linha rápida de reações */}
                <div className="flex items-center justify-around bg-muted/60 rounded-full px-2 py-1.5">
                  {QUICK_EMOJIS.map((emo) => (
                    <button
                      key={emo}
                      type="button"
                      onClick={() => {
                        onToggleReaction?.(actionMsg, emo);
                        closeActionSheet();
                      }}
                      className={`text-xl px-1.5 py-1 rounded-full transition active:scale-95 ${
                        myReaction === emo ? "bg-primary/15" : "hover:bg-background"
                      }`}
                      aria-label={`Reagir com ${emo}`}
                    >
                      {emo}
                    </button>
                  ))}
                </div>

                {/* Ações */}
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => { onReplyMessage?.(actionMsg); closeActionSheet(); }}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted text-left text-sm"
                  >
                    <CornerUpLeft className="w-4 h-4 text-muted-foreground" /> Responder
                  </button>
                  <button
                    type="button"
                    onClick={() => { onCopyMessage?.(actionMsg); closeActionSheet(); }}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted text-left text-sm"
                  >
                    <Copy className="w-4 h-4 text-muted-foreground" /> Copiar
                  </button>
                  <button
                    type="button"
                    onClick={() => showComing("Seletor completo de emojis")}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted text-left text-sm"
                  >
                    <Smile className="w-4 h-4 text-muted-foreground" /> Reagir
                  </button>
                  <button
                    type="button"
                    onClick={() => showComing("Encaminhamento")}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted text-left text-sm"
                  >
                    <Forward className="w-4 h-4 text-muted-foreground" /> Encaminhar
                  </button>
                  <button
                    type="button"
                    onClick={() => showComing("Fixar mensagem")}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted text-left text-sm"
                  >
                    <Pin className="w-4 h-4 text-muted-foreground" /> Fixar
                  </button>
                  <button
                    type="button"
                    onClick={() => showComing("Favoritos")}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted text-left text-sm"
                  >
                    <Star className="w-4 h-4 text-muted-foreground" /> Favoritar
                  </button>
                  <button
                    type="button"
                    onClick={() => showComing("Seleção múltipla")}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted text-left text-sm"
                  >
                    <SquareCheck className="w-4 h-4 text-muted-foreground" /> Selecionar
                  </button>
                </div>

                <button
                  type="button"
                  onClick={closeActionSheet}
                  className="mt-1 mx-auto text-sm text-muted-foreground px-4 py-2"
                >
                  Cancelar
                </button>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}

