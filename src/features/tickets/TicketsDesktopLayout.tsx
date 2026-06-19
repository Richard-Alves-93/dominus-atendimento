import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Search,
  Send,
  Phone,
  MoreVertical,
  Check,
  CheckCheck,
  MessageSquare,
  Loader2,
  Users,
  UserPlus,
  Building2,
  CheckCircle2,
  Clock,
  RotateCcw,
  AlertCircle,
  AlarmClock,
  FileText,
  Download,
  Image as ImageIcon,
  Paperclip,
  Mic,
  Camera,
  User as UserIcon,
  Music,
  Plus,
  Trash2,
  CalendarPlus,
  BarChart3,
  ChevronDown,
  CornerUpLeft,
  Copy as CopyIcon,
  Forward,
  Pin,
  Star,
  SquareCheck,
  Smile,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { EventModal } from "@/components/events/EventModal";
import { QuickRepliesPopover } from "@/components/QuickRepliesPopover";
import { useIsMobile } from "@/hooks/use-mobile";
import TicketsMobileLayout from "@/features/tickets/TicketsMobileLayout";
import { MediaContent, formatBytes as _sharedFormatBytes, formatDuration as _sharedFormatDuration } from "@/features/tickets/MediaContent";

const MENU_GLASS_CLASS =
  "bg-white/95 dark:bg-slate-900/90 backdrop-blur-md border border-border/60 shadow-lg";

type TicketStatus = "open" | "pending" | "closed";
type ListFilter = "todos" | "fila" | "meus" | "open" | "pending" | "closed";

interface TicketRow {
  id: string;
  company_id: string;
  contact_id: string;
  channel_id: string | null;
  status: TicketStatus;
  unread_count: number;
  last_message_at: string | null;
  subject: string | null;
  protocol_number: string | null;
  department_id: string | null;
  assigned_user_id: string | null;
  contact: { id: string; name: string | null; phone_number: string | null; avatar_url: string | null } | null;
  channel: { id: string; channel_type: string; status: string } | null;
  department: { id: string; name: string } | null;
  assignee?: { id: string; full_name: string | null; email: string | null } | null;
}

interface MessageRow {
  id: string;
  ticket_id: string;
  direction: "inbound" | "outbound";
  from_me: boolean;
  body: string | null;
  msg_type: string;
  status: string | null;
  delivery_status?: string | null;
  failure_reason?: string | null;
  sent_at: string;
  created_at: string;
  source?: string | null;
  sent_by_name?: string | null;
  provider_message_id?: string | null;
  external_id?: string | null;
  media_mime_type?: string | null;
  media_file_name?: string | null;
  media_size?: number | null;
  media_duration?: number | null;
  media_caption?: string | null;
  media_storage_path?: string | null;
  media_url?: string | null;
  reply_to_message_id?: string | null;
  reply_to_provider_message_id?: string | null;
  reply_to_preview?: string | null;
  reply_to_sender_name?: string | null;
  reply_to_message_type?: string | null;
  is_edited?: boolean | null;
  edited_at?: string | null;
  _optimistic?: boolean;
}


interface PendingMessage {
  tempId: string;
  ticketId: string;
  body: string;
  createdAt: string;
  status: "sending" | "error";
  media?: {
    type: "image" | "video" | "audio" | "document";
    fileName: string;
    mimeType: string;
    size: number;
    previewUrl: string; // local blob URL
    caption: string | null;
  };
}

interface DeptRow { id: string; name: string; status: string; allow_general_queue?: boolean; allow_stalled_takeover?: boolean }
interface UserOption { user_id: string; full_name: string | null; email: string | null }
interface CompanySettingsRow {
  company_id?: string;
  allow_stalled_takeover: boolean;
  stalled_minutes: number;
  same_department_only: boolean;
  updated_at?: string;
}

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Aberto",
  pending: "Pendente",
  closed: "Fechado",
};

// ── Envio de mídia ───────────────────────────────────────────────
const MEDIA_LIMITS = {
  image: 10 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  video: 32 * 1024 * 1024,
  document: 25 * 1024 * 1024,
} as const;
const ACCEPT_TYPES =
  "image/*,video/*,audio/*,application/pdf,application/msword," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
  "text/plain";
const FORBIDDEN_EXT = /\.(exe|bat|cmd|sh|js|html?|php|jar|msi|scr|vbs|ps1|com|pif|reg|svg)$/i;

function normalizeMime(mimeRaw: string): string {
  return (mimeRaw || "").split(";")[0].trim().toLowerCase();
}

function detectMediaType(mimeRaw: string): "image" | "video" | "audio" | "document" | null {
  const mime = normalizeMime(mimeRaw);
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (
    mime === "application/pdf" ||
    mime === "application/msword" ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/vnd.ms-excel" ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "text/plain" ||
    mime === "text/csv"
  ) return "document";
  return null;
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

function formatBytes(n?: number | null) {
  if (!n || n <= 0) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}

function formatDuration(s?: number | null) {
  if (!s || s <= 0) return "";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

function MediaContent({ m, onMime }: { m: MessageRow; onMime: (mime?: string | null) => string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const path = m.media_storage_path;
  const mediaUrl = m.media_url;
  const type = m.msg_type;

  const safeExternalUrl = useMemo(() => {
    if (!mediaUrl) return null;
    // Optimistic local previews use blob: URLs — allow them as-is.
    if (mediaUrl.startsWith("blob:")) return mediaUrl;
    try {
      const u = new URL(mediaUrl);
      const params = u.search.toLowerCase();
      if (!["http:", "https:"].includes(u.protocol)) return null;
      if (params.includes("token") || params.includes("apikey") || params.includes("api_key") || params.includes("authorization")) return null;
      return u.toString();
    } catch {
      return null;
    }
  }, [mediaUrl]);

  const fallbackText =
    type === "image" ? "Imagem recebida" :
    type === "audio" ? "Áudio recebido" :
    type === "video" ? "Vídeo recebido" :
    type === "document" ? "Documento recebido" :
    type === "sticker" ? "Figurinha recebida" :
    `[${type}]`;

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setError(false);
    setLoading(false);
    if (!path) {
      if (safeExternalUrl) setUrl(safeExternalUrl);
      return;
    }
    setLoading(true);
    supabase.storage.from("message-media").createSignedUrl(path, 3600).then(({ data, error: err }) => {
      if (cancelled) return;
      if (err || !data?.signedUrl) {
        console.warn("[MEDIA_SIGNED_URL_AUDIT]", {
          messageId: m.id, msg_type: type, media_storage_path: path, media_url: mediaUrl ?? null,
          signedUrlSuccess: false, signedUrlError: err?.message ?? "no_url",
        });
        if (safeExternalUrl) setUrl(safeExternalUrl);
        setError(true);
        setLoading(false);
        return;
      }
      console.debug("[MEDIA_SIGNED_URL_AUDIT]", {
        messageId: m.id, msg_type: type, media_storage_path: path, media_url: mediaUrl ?? null,
        signedUrlSuccess: true, signedUrlError: null,
      });
      setUrl(data.signedUrl);
      setLoading(false);
    }).catch((e: unknown) => {
      if (cancelled) return;
      console.warn("[MEDIA_SIGNED_URL_AUDIT]", {
        messageId: m.id, msg_type: type, media_storage_path: path, media_url: mediaUrl ?? null,
        signedUrlSuccess: false, signedUrlError: (e as Error)?.message,
      });
      if (safeExternalUrl) setUrl(safeExternalUrl);
      setError(true);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [path, m.id, type, mediaUrl, safeExternalUrl]);

  if (!path && !url) return <p className="text-sm italic opacity-80">{fallbackText}</p>;
  if (error && !url) return <p className="text-sm italic opacity-80">{fallbackText}, mas não foi possível carregar.</p>;
  if (loading || !url) {
    return <div className="flex items-center gap-2 text-xs opacity-70"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando mídia...</div>;
  }

  if (type === "image" || type === "sticker") {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img
          src={url}
          alt={m.media_file_name ?? "imagem"}
          className={type === "sticker" ? "max-h-32 object-contain" : "max-h-72 rounded-lg object-cover"}
          loading="lazy"
          onError={() => setError(true)}
        />
      </a>
    );
  }
  if (type === "audio") {
    return <audio src={url} controls preload="metadata" className="w-64 max-w-full" onError={() => setError(true)} />;
  }
  if (type === "video") {
    return <video src={url} controls preload="metadata" className="max-h-72 rounded-lg" onError={() => setError(true)} />;
  }
  if (type === "document") {
    return (
      <a href={url} target="_blank" rel="noreferrer" download={m.media_file_name ?? undefined}
        className="flex items-center gap-3 rounded-lg border border-current/20 bg-background/40 px-3 py-2 hover:bg-background/60 transition-colors">
        <FileText className="w-6 h-6 shrink-0 opacity-80" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{m.media_file_name ?? "Arquivo"}</div>
          <div className="text-[11px] opacity-70">
            {[onMime(m.media_mime_type), formatBytes(m.media_size)].filter(Boolean).join(" · ")}
          </div>
        </div>
        <Download className="w-4 h-4 opacity-70" />
      </a>
    );
  }
  return <a href={url} target="_blank" rel="noreferrer" className="text-sm underline">Baixar mídia</a>;
}

const TicketsDesktopLayout = () => {
  const qc = useQueryClient();
  const { activeCompanyId, activeMembership } = useCompany();
  const { profile } = useAuth();
  const isMaster = profile?.is_master === true || profile?.global_role === "master";
  const role = activeMembership?.role;
  const isAdmin = isMaster || role === "owner" || role === "admin";
  const isManager = role === "manager";
  const canManageTicket = isAdmin || isManager;

  const [filter, setFilter] = useState<ListFilter>("todos");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  // selectedId is persisted per (company, user) so switching tabs / token
  // refresh doesn't close the open conversation. Storage key is rebuilt
  // when company or user changes, and restoration is validated against the
  // tickets actually visible to this user (RLS already scopes the list).
  const selectionStorageKey = useMemo(() => {
    if (!activeCompanyId || !profile?.id) return null;
    return `dominus:selected_ticket:${activeCompanyId}:${profile.id}`;
  }, [activeCompanyId, profile?.id]);

  const [selectedId, _setSelectedId] = useState<string | null>(null);
  const setSelectedId = (id: string | null) => {
    _setSelectedId(id);
    if (typeof window === "undefined" || !selectionStorageKey) return;
    try {
      if (id && activeCompanyId) {
        sessionStorage.setItem(
          selectionStorageKey,
          JSON.stringify({ ticket_id: id, company_id: activeCompanyId, updated_at: new Date().toISOString() }),
        );
      } else {
        sessionStorage.removeItem(selectionStorageKey);
      }
    } catch { /* ignore */ }
  };
  const [text, setText] = useState("");
  const [replyingTo, setReplyingTo] = useState<MessageRow | null>(null);
  const isMobile = useIsMobile();
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };
  const startLongPress = (id: string) => {
    if (!isMobile) return;
    clearLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      setSelectedMessageId(id);
      try { (navigator as any).vibrate?.(20); } catch { /* noop */ }
    }, 450);
  };
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [search, setSearch] = useState("");
  const [assignDeptOpen, setAssignDeptOpen] = useState(false);
  const [assignUserOpen, setAssignUserOpen] = useState(false);
  const [takeOverOpen, setTakeOverOpen] = useState(false);
  const [transferConfirmOpen, setTransferConfirmOpen] = useState(false);
  const [pendingDeptId, setPendingDeptId] = useState<string>("");
  const [pendingUserId, setPendingUserId] = useState<string>("");
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachType, setAttachType] = useState<"image" | "video" | "audio" | "document" | null>(null);
  const [attachPreviewUrl, setAttachPreviewUrl] = useState<string | null>(null);
  const [attachCaption, setAttachCaption] = useState("");
  const [attachUploading, setAttachUploading] = useState(false);

  // Gravação de áudio
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [recSending, setRecSending] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recStreamRef = useRef<MediaStream | null>(null);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recCancelledRef = useRef(false);
  const REC_MAX_SECONDS = 5 * 60;

  // Departments of company
  const deptsQuery = useQuery({
    queryKey: ["company-depts", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("departments")
        .select("id, name, status, allow_general_queue, allow_stalled_takeover")
        .eq("company_id", activeCompanyId!)
        .is("deleted_at", null)
        .order("name");
      return (data ?? []) as DeptRow[];
    },
  });
  const activeDepts = (deptsQuery.data ?? []).filter((d) => d.status === "active");

  // Company settings (regras de atendimento)
  const settingsQuery = useQuery({
    queryKey: ["company-settings", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("company_settings")
        .select("*")
        .eq("company_id", activeCompanyId!)
        .maybeSingle();
      const row = (data ?? {
        company_id: activeCompanyId!,
        allow_stalled_takeover: true,
        stalled_minutes: 15,
        same_department_only: true,
      }) as CompanySettingsRow;
      if (typeof window !== "undefined") {
        console.debug("[STALLED_SETTINGS_AUDIT]", {
          companyId: activeCompanyId,
          allow_stalled_takeover: row.allow_stalled_takeover,
          stalled_minutes: row.stalled_minutes,
          same_department_only: row.same_department_only,
          rawSettings: data ?? null,
        });
      }
      return row;
    },
    refetchOnMount: "always",
  });
  const settings = settingsQuery.data ?? {
    allow_stalled_takeover: true,
    stalled_minutes: 15,
    same_department_only: true,
  };

  // My departments (non-admin)
  const myDeptsQuery = useQuery({
    queryKey: ["my-depts", activeCompanyId, profile?.id],
    enabled: !!activeCompanyId && !!profile?.id && !isAdmin,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("department_users")
        .select("department_id, role")
        .eq("company_id", activeCompanyId!)
        .eq("user_id", profile!.id)
        .eq("status", "active");
      return (data ?? []) as { department_id: string; role: string }[];
    },
  });
  const myDeptIds = (myDeptsQuery.data ?? []).map((d) => d.department_id);
  const myManagedDeptIds = (myDeptsQuery.data ?? []).filter((d) => d.role === "manager").map((d) => d.department_id);

  // Departments where the current user can see/accept the general queue
  const generalQueueDeptIds = useMemo(() => {
    const allowed = new Set(
      (deptsQuery.data ?? []).filter((d) => d.allow_general_queue && d.status === "active").map((d) => d.id),
    );
    if (isAdmin) return Array.from(allowed);
    return myDeptIds.filter((id) => allowed.has(id));
  }, [deptsQuery.data, myDeptIds, isAdmin]);
  const canSeeGeneralQueue = isAdmin || generalQueueDeptIds.length > 0;

  const ticketsQuery = useQuery({
    queryKey: ["tickets", activeCompanyId, filter, deptFilter, profile?.id, isAdmin, myDeptIds.join(","), generalQueueDeptIds.join(",")],
    enabled: !!activeCompanyId && (isAdmin || myDeptsQuery.isFetched || !profile?.id),
    queryFn: async () => {
      let q = (supabase as any)
        .from("tickets")
        .select(
          "id, company_id, contact_id, channel_id, status, unread_count, last_message_at, subject, protocol_number, department_id, assigned_user_id, contact:contacts(id, name, phone_number, avatar_url), channel:channels(id, channel_type, status), department:departments(id, name)",
        )
        .eq("company_id", activeCompanyId!)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(200);

      // status filter
      if (filter === "pending") {
        // Pendentes = não aceitos, não fechados, com unread_count > 0
        q = q.is("assigned_user_id", null).neq("status", "closed").gt("unread_count", 0);
      } else if (filter === "open") {
        // Abertos = aceitos/em atendimento
        q = q.eq("status", "open").not("assigned_user_id", "is", null);
      } else if (filter === "closed") {
        q = q.eq("status", "closed");
      } else if (filter === "fila") {
        q = q.is("assigned_user_id", null).neq("status", "closed");
        if (!isAdmin) {
          // Limit fila geral to user's allowed departments (or null department)
          if (generalQueueDeptIds.length === 0) {
            q = q.eq("id", "00000000-0000-0000-0000-000000000000"); // force empty
          } else {
            q = q.or(`department_id.is.null,department_id.in.(${generalQueueDeptIds.join(",")})`);
          }
        }
      } else if (filter === "meus" && profile?.id) {
        q = q.eq("assigned_user_id", profile.id).neq("status", "closed");
      } else {
        // todos: hide closed by default
        q = q.neq("status", "closed");
      }

      if (deptFilter !== "all") {
        q = q.eq("department_id", deptFilter);
      }

      if (!isAdmin && profile?.id && filter !== "meus" && filter !== "fila") {
        const parts: string[] = [`assigned_user_id.eq.${profile.id}`];
        if (generalQueueDeptIds.length > 0) parts.push(`department_id.is.null`);
        const visibleDepts = Array.from(new Set([...myDeptIds, ...generalQueueDeptIds]));
        if (visibleDepts.length > 0) parts.push(`department_id.in.(${visibleDepts.join(",")})`);
        q = q.or(parts.join(","));
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as TicketRow[];
    },
  });

  // Fetch assignee profiles separately (FK is to auth.users, not embeddable into profiles)
  const assigneeIds = useMemo(() => {
    const set = new Set<string>();
    (ticketsQuery.data ?? []).forEach((t) => { if (t.assigned_user_id) set.add(t.assigned_user_id); });
    return Array.from(set);
  }, [ticketsQuery.data]);

  const assigneeProfilesQuery = useQuery({
    queryKey: ["assignee-profiles", assigneeIds.join(",")],
    enabled: assigneeIds.length > 0,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("profiles").select("id, full_name, email").in("id", assigneeIds);
      const map: Record<string, { id: string; full_name: string | null; email: string | null }> = {};
      (data ?? []).forEach((p: any) => { map[p.id] = p; });
      return map;
    },
  });

  // Candidatos a "atendimento parado" na lista: status=open e com responsável.
  const stalledCandidateIds = useMemo(() => {
    return (ticketsQuery.data ?? [])
      .filter((t) => t.status === "open" && !!t.assigned_user_id)
      .map((t) => t.id);
  }, [ticketsQuery.data]);

  // Busca eficiente (1 query) das mensagens recentes dos candidatos para derivar
  // last_inbound_at / last_outbound_at por ticket. Evita N+1.
  const ticketTimelinesQuery = useQuery({
    queryKey: ["ticket-timelines", activeCompanyId, stalledCandidateIds.join(",")],
    enabled: !!activeCompanyId && stalledCandidateIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("messages")
        .select("ticket_id, from_me, sent_at, created_at")
        .in("ticket_id", stalledCandidateIds)
        .order("created_at", { ascending: false })
        .limit(Math.min(2000, stalledCandidateIds.length * 20));
      if (error) throw error;
      const map: Record<string, { lastInboundTs: number | null; lastOutboundTs: number | null }> = {};
      for (const id of stalledCandidateIds) map[id] = { lastInboundTs: null, lastOutboundTs: null };
      for (const r of (data ?? []) as Array<{ ticket_id: string; from_me: boolean; sent_at: string | null; created_at: string }>) {
        const entry = map[r.ticket_id];
        if (!entry) continue;
        const ts = new Date(r.sent_at || r.created_at).getTime();
        if (!Number.isFinite(ts)) continue;
        if (!r.from_me && entry.lastInboundTs == null) entry.lastInboundTs = ts;
        if (r.from_me && entry.lastOutboundTs == null) entry.lastOutboundTs = ts;
      }
      return map;
    },
    staleTime: 0,
  });

  const tickets = useMemo(() => {
    const list = ticketsQuery.data ?? [];
    const pmap = assigneeProfilesQuery.data ?? {};
    const withAssignee = list.map((t) => ({
      ...t,
      assignee: t.assigned_user_id ? pmap[t.assigned_user_id] ?? null : null,
    }));
    if (!search.trim()) return withAssignee;
    const s = search.toLowerCase();
    return withAssignee.filter(
      (t) =>
        (t.contact?.name || "").toLowerCase().includes(s) ||
        (t.contact?.phone_number || "").includes(s),
    );
  }, [ticketsQuery.data, assigneeProfilesQuery.data, search]);

  const selected = useMemo(
    () => tickets.find((t) => t.id === selectedId) ?? null,
    [tickets, selectedId],
  );

  // Restaura o ticket selecionado quando a lista carrega. Só restaura se o
  // ticket existir na lista visível ao usuário (RLS + filtro do setor já
  // garantem que ele tem permissão). Caso contrário, limpa o storage.
  const restoredKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectionStorageKey || ticketsQuery.isLoading) return;
    if (restoredKeyRef.current === selectionStorageKey) return;
    restoredKeyRef.current = selectionStorageKey;
    if (selectedId) return;
    try {
      const raw = sessionStorage.getItem(selectionStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { ticket_id?: string; company_id?: string };
      if (!parsed?.ticket_id || parsed.company_id !== activeCompanyId) {
        sessionStorage.removeItem(selectionStorageKey);
        return;
      }
      const stillVisible = (ticketsQuery.data ?? []).some((t) => t.id === parsed.ticket_id);
      if (stillVisible) {
        _setSelectedId(parsed.ticket_id);
      } else {
        sessionStorage.removeItem(selectionStorageKey);
      }
    } catch {
      try { sessionStorage.removeItem(selectionStorageKey); } catch { /* ignore */ }
    }
  }, [selectionStorageKey, ticketsQuery.isLoading, ticketsQuery.data, activeCompanyId, selectedId]);

  const [eventModalOpen, setEventModalOpen] = useState(false);

  // Importante: NÃO zerar unread_count apenas por visualizar.
  // O ticket pendente deve permanecer em Pendentes até que o usuário
  // clique explicitamente em "Aceitar atendimento". O zeramento de
  // unread_count e a atribuição (assigned_user_id) acontecem somente
  // no acceptMutation/takeOverMutation.

  // Não selecionar nenhum atendimento automaticamente — o usuário escolhe.


  // Permission to manage current selected ticket
  const canEditSelected = useMemo(() => {
    if (!selected) return false;
    if (isAdmin) return true;
    if (isManager) {
      if (!selected.department_id) return true;
      return myManagedDeptIds.includes(selected.department_id);
    }
    return false;
  }, [selected, isAdmin, isManager, myManagedDeptIds]);

  // Permissão para transferir setor / atribuir atendente:
  // Master, Admin/Owner, Gerente do setor, ou Atendente responsável pelo ticket.
  const canTransferDepartment = useMemo(() => {
    if (!selected) return false;
    if (isAdmin) return true;
    if (isManager) {
      if (!selected.department_id) return true;
      return myManagedDeptIds.includes(selected.department_id);
    }
    if (profile?.id && selected.assigned_user_id === profile.id) return true;
    return false;
  }, [selected, isAdmin, isManager, myManagedDeptIds, profile?.id]);
  const canAssignUser = canTransferDepartment;

  // Users for assignment (filtered by selected ticket's department)
  const assignableUsersQuery = useQuery({
    queryKey: ["assignable-users", activeCompanyId, selected?.department_id],
    enabled: !!activeCompanyId && assignUserOpen,
    queryFn: async () => {
      let userIds: string[] = [];
      if (selected?.department_id) {
        const { data } = await (supabase as any)
          .from("department_users")
          .select("user_id")
          .eq("company_id", activeCompanyId!)
          .eq("department_id", selected.department_id)
          .eq("status", "active");
        userIds = ((data ?? []) as any[]).map((r) => r.user_id);
      } else {
        const { data } = await (supabase as any)
          .from("company_users")
          .select("user_id")
          .eq("company_id", activeCompanyId!)
          .eq("status", "active");
        userIds = ((data ?? []) as any[]).map((r) => r.user_id);
      }
      if (userIds.length === 0) return [] as UserOption[];
      const { data: profs } = await (supabase as any)
        .from("profiles").select("id, full_name, email").in("id", userIds);
      return ((profs ?? []) as any[]).map((p) => ({
        user_id: p.id, full_name: p.full_name ?? null, email: p.email ?? null,
      })) as UserOption[];
    },
  });

  // Ao abrir um ticket: zerar unread_count (somente leitura/visualização).
  // NÃO altera assigned_user_id, status nem move de Pendentes para Atendendo.
  const evoMarkReadGuardRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!selectedId || !activeCompanyId) return;
    const current = (ticketsQuery.data ?? []).find((t) => t.id === selectedId);
    if (!current || (current.unread_count ?? 0) === 0) return;
    const prev = current.unread_count ?? 0;
    // Optimistic local update — badge desaparece sem F5
    qc.setQueryData(["tickets", activeCompanyId], (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.map((t: any) => (t.id === selectedId ? { ...t, unread_count: 0 } : t));
    });
    (async () => {
      const { error } = await (supabase as any)
        .from("tickets")
        .update({ unread_count: 0 })
        .eq("id", selectedId)
        .eq("company_id", activeCompanyId);
      if (error) {
        console.warn("[TICKET_MARK_READ_AUDIT] failed", { ticket_id: selectedId, error: error.message });
      } else {
        console.log("[TICKET_MARK_READ_AUDIT]", {
          company_id: activeCompanyId,
          ticket_id: selectedId,
          previous_unread_count: prev,
          new_unread_count: 0,
        });
      }
    })();
    // Marca como lido no WhatsApp/Evolution — não bloqueia UI, falha silenciosa.
    if (current.channel?.channel_type !== "whatsapp" || !current.channel_id || !current.contact?.id) return;
    const guardKey = `${selectedId}:${prev}`;
    if (!evoMarkReadGuardRef.current.has(guardKey)) {
      evoMarkReadGuardRef.current.add(guardKey);
      console.log("[WHATSAPP_MARK_READ_CLIENT_CALL]", {
        ticket_id: selectedId,
        company_id: activeCompanyId,
        channel_id: current.channel_id,
        unread_count: prev,
      });
      supabase.functions
        .invoke("mark-whatsapp-chat-read", {
          body: { ticket_id: selectedId, company_id: activeCompanyId },
        })
        .catch((err) => {
          console.warn("[WHATSAPP_MARK_READ_ERROR] invoke", { ticket_id: selectedId, message: err?.message });
        });
    }
  }, [selectedId, activeCompanyId, ticketsQuery.data, qc]);

  const isPendingAcceptance = !!selected && !selected.assigned_user_id && selected.status !== "closed";
  const canAcceptSelected = useMemo(() => {
    if (!selected || !profile?.id) return false;
    if (selected.status === "closed") return false;
    if (selected.assigned_user_id) return false;
    if (isAdmin) return true;
    if (isManager) {
      if (!selected.department_id) return canSeeGeneralQueue;
      return myManagedDeptIds.includes(selected.department_id);
    }
    // agent
    if (!selected.department_id) return canSeeGeneralQueue;
    return myDeptIds.includes(selected.department_id);
  }, [selected, profile?.id, isAdmin, isManager, myManagedDeptIds, myDeptIds, canSeeGeneralQueue]);

  const writeAuditLog = async (
    ticketId: string,
    previous: string | null,
    next: string | null,
    reason: string,
  ) => {
    if (!activeCompanyId || !profile?.id) return;
    try {
      await (supabase as any).from("audit_logs").insert({
        company_id: activeCompanyId,
        ticket_id: ticketId,
        event_type: "ticket_assigned_changed",
        previous_assigned_user_id: previous,
        new_assigned_user_id: next,
        changed_by: profile.id,
        reason,
      });
    } catch (e) {
      console.warn("audit_log insert failed", e);
    }
  };

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!selected || !profile?.id) throw new Error("Sem atendimento selecionado");
      const nowIso = new Date().toISOString();
      const patch: Record<string, any> = {
        assigned_user_id: profile.id,
        assigned_at: nowIso,
        assigned_by: profile.id,
        unread_count: 0,
        status: "open",
      };
      // Auto-fill department if ticket has none and user has exactly one allowed general-queue dept
      if (!selected.department_id && !isAdmin && generalQueueDeptIds.length === 1) {
        patch.department_id = generalQueueDeptIds[0];
      }
      const previous = selected.assigned_user_id ?? null;
      const ticketId = selected.id;
      const { error } = await (supabase as any)
        .from("tickets")
        .update(patch)
        .eq("id", ticketId);
      if (error) throw error;
      await writeAuditLog(ticketId, previous, profile.id, "aceitar_atendimento");
    },
    onSuccess: () => {
      toast({ title: "Atendimento aceito" });
      qc.invalidateQueries({ queryKey: ["tickets", activeCompanyId] });
    },
    onError: (e: Error) => {
      toast({ title: "Falha ao aceitar", description: e.message, variant: "destructive" });
    },
  });

  // Assumir atendimento: usuário superior pega ticket já atribuído a outro
  const isAssignedToOther = !!selected?.assigned_user_id && selected.assigned_user_id !== profile?.id;
  const canTakeOverPrivileged = useMemo(() => {
    if (!selected || !profile?.id) return false;
    if (!isAssignedToOther) return false;
    if (selected.status === "closed") return false;
    if (isAdmin) return true;
    if (isManager) {
      if (!selected.department_id) return false;
      return myManagedDeptIds.includes(selected.department_id);
    }
    return false;
  }, [selected, profile?.id, isAssignedToOther, isAdmin, isManager, myManagedDeptIds]);

  const takeOverMutation = useMutation({
    mutationFn: async (reason: string = "assumir_atendimento") => {
      if (!selected || !profile?.id) throw new Error("Sem atendimento selecionado");
      const nowIso = new Date().toISOString();
      const previous = selected.assigned_user_id ?? null;
      const ticketId = selected.id;
      const { error } = await (supabase as any)
        .from("tickets")
        .update({
          assigned_user_id: profile.id,
          assigned_at: nowIso,
          assigned_by: profile.id,
          unread_count: 0,
          status: "open",
        })
        .eq("id", ticketId)
        .eq("company_id", activeCompanyId!);
      if (error) throw error;
      await writeAuditLog(ticketId, previous, profile.id, reason);
    },
    onSuccess: () => {
      toast({ title: "Atendimento assumido" });
      setTakeOverOpen(false);
      qc.invalidateQueries({ queryKey: ["tickets", activeCompanyId] });
      qc.invalidateQueries({ queryKey: ["assignee-profiles"] });
    },
    onError: (e: Error) => {
      toast({ title: "Falha ao assumir", description: e.message, variant: "destructive" });
    },
  });



  const messagesQuery = useQuery({
    queryKey: ["messages", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, ticket_id, direction, from_me, body, msg_type, status, delivery_status, failure_reason, sent_at, created_at, source, sent_by_name, provider_message_id, external_id, media_mime_type, media_file_name, media_size, media_duration, media_caption, media_storage_path, media_url, reply_to_message_id, reply_to_provider_message_id, reply_to_preview, reply_to_sender_name, reply_to_message_type, is_edited, edited_at")
        .eq("ticket_id", selectedId!)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as MessageRow[];
    },
  });

  // Realtime: messages for the currently selected ticket
  useEffect(() => {
    if (!selectedId) return;
    const channel = supabase
      .channel(`messages:${selectedId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `ticket_id=eq.${selectedId}` },
        (payload) => {
          const row = payload.new as MessageRow;
          qc.setQueryData<MessageRow[]>(["messages", selectedId], (prev = []) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, row];
          });
          // Drop any matching optimistic bubble for this ticket+body
          if (row.from_me) {
            setPendingMessages((prev) =>
              prev.filter(
                (p) =>
                  !(p.ticketId === selectedId && (row.body ?? "").includes(p.body)),
              ),
            );
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `ticket_id=eq.${selectedId}` },
        (payload) => {
          const row = payload.new as MessageRow;
          qc.setQueryData<MessageRow[]>(["messages", selectedId], (prev = []) =>
            prev.map((m) => (m.id === row.id ? { ...m, ...row } : m)),
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedId, qc]);

  // Realtime: tickets list for active company
  useEffect(() => {
    if (!activeCompanyId) return;
    const channel = supabase
      .channel(`tickets:${activeCompanyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets", filter: `company_id=eq.${activeCompanyId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["tickets", activeCompanyId] });
          qc.invalidateQueries({ queryKey: ["ticket-timelines", activeCompanyId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeCompanyId, qc]);

  const pendingForSelected = useMemo(
    () => pendingMessages.filter((p) => p.ticketId === selectedId),
    [pendingMessages, selectedId],
  );

  const visibleMessages = useMemo<MessageRow[]>(() => {
    const real = (messagesQuery.data ?? []) as MessageRow[];
    const optimistic: MessageRow[] = pendingForSelected.map((p) => {
      const r = (p as any).reply as { message_id?: string; provider_message_id?: string | null; preview?: string; sender_name?: string; message_type?: string } | null | undefined;
      return {
        id: p.tempId,
        ticket_id: p.ticketId,
        direction: "outbound",
        from_me: true,
        body: p.body,
        msg_type: p.media?.type ?? "text",
        status: p.status === "error" ? "error" : "sending",
        sent_at: p.createdAt,
        created_at: p.createdAt,
        media_mime_type: p.media?.mimeType ?? null,
        media_file_name: p.media?.fileName ?? null,
        media_size: p.media?.size ?? null,
        media_caption: p.media?.caption ?? null,
        media_storage_path: null,
        media_url: p.media?.previewUrl ?? null,
        reply_to_message_id: r?.message_id ?? null,
        reply_to_provider_message_id: r?.provider_message_id ?? null,
        reply_to_preview: r?.preview ?? null,
        reply_to_sender_name: r?.sender_name ?? null,
        reply_to_message_type: r?.message_type ?? null,
        _optimistic: true,
      };
    });
    return [...real, ...optimistic];
  }, [messagesQuery.data, pendingForSelected]);

  // ─── Smart scroll ──────────────────────────────────────────────────
  // • Abrir conversa → rola direto pro fim (instant) assim que mensagens
  //   chegarem; usa requestAnimationFrame pra esperar o layout estabilizar.
  // • Nova mensagem → só rola se o usuário JÁ estava perto do fim.
  // • Botão flutuante "voltar ao fim" aparece quando usuário sobe o scroll.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const lastScrolledTicketRef = useRef<string | null>(null);
  const lastMessageCountRef = useRef(0);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    // Fallback pro endRef caso o container ainda esteja calculando layout.
    requestAnimationFrame(() => {
      const c = scrollContainerRef.current;
      if (c) c.scrollTop = c.scrollHeight;
      endRef.current?.scrollIntoView({ behavior, block: "end" });
    });
  };

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    setIsNearBottom(near);
  };

  // Scroll inicial ao abrir conversa: espera mensagens carregarem.
  useEffect(() => {
    if (!selectedId) return;
    if (messagesQuery.isLoading) return;
    if (lastScrolledTicketRef.current === selectedId) return;
    lastScrolledTicketRef.current = selectedId;
    lastMessageCountRef.current = visibleMessages.length;
    // Dois rAFs pra garantir que mídias/labels já reservaram altura.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToBottom("auto");
        setIsNearBottom(true);
      });
    });
  }, [selectedId, messagesQuery.isLoading, visibleMessages.length]);

  // Nova mensagem chegando: só rola se o usuário estava no fim.
  useEffect(() => {
    if (!selectedId) return;
    if (lastScrolledTicketRef.current !== selectedId) return;
    const prev = lastMessageCountRef.current;
    const next = visibleMessages.length;
    lastMessageCountRef.current = next;
    if (next > prev && isNearBottom) {
      requestAnimationFrame(() => scrollToBottom("smooth"));
    }
  }, [visibleMessages.length, selectedId, isNearBottom]);


  // ─── Atendimento parado ────────────────────────────────────────────
  // Considerado parado quando:
  //  • status = open
  //  • assigned_user_id != null
  //  • existe última mensagem inbound do cliente
  //  • não existe outbound posterior à última inbound
  //  • tempo desde a última inbound >= stalled_minutes
  // Tick a cada 30s para recalcular sem F5
  const [nowTs, setNowTs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => {
      setNowTs(Date.now());
      // Mantém timelines da lista frescas sem F5
      void qc.invalidateQueries({ queryKey: ["ticket-timelines", activeCompanyId] });
      void qc.invalidateQueries({ queryKey: ["tickets", activeCompanyId] });
    }, 15000);
    return () => window.clearInterval(id);
  }, [qc, activeCompanyId]);

  // Mapa de "atendimento parado" para cada ticket da lista — mesma regra do painel.
  // Usa timelines (precisas) com fallback no próprio ticket (last_message_at + unread_count)
  // para refletir imediatamente novas mensagens chegando via realtime.
  const listStalledMap = useMemo(() => {
    const out = new Map<string, { stalled: boolean; minutes: number }>();
    const stalledMs = (settings.stalled_minutes || 0) * 60000;
    if (stalledMs <= 0) return out;
    const tl = ticketTimelinesQuery.data ?? {};
    const list = ticketsQuery.data ?? [];
    for (const t of list) {
      if (t.status !== "open" || !t.assigned_user_id) continue;
      const entry = tl[t.id];
      let lastInboundTs = entry?.lastInboundTs ?? null;
      const lastOutboundTs = entry?.lastOutboundTs ?? null;
      // Fallback realtime: se ainda não temos timeline e há mensagens não lidas,
      // assume que last_message_at é a última inbound do cliente.
      if (lastInboundTs == null && (t.unread_count ?? 0) > 0 && t.last_message_at) {
        lastInboundTs = new Date(t.last_message_at).getTime();
      }
      if (lastInboundTs == null) continue;
      const hasCustomerWaiting =
        lastOutboundTs == null ||
        lastInboundTs > lastOutboundTs ||
        (t.unread_count ?? 0) > 0;
      if (!hasCustomerWaiting) continue;
      const elapsedMs = nowTs - lastInboundTs;
      const isStalled = elapsedMs >= stalledMs;
      if (import.meta.env.DEV) {
        console.debug("[STALLED_LIST_AUDIT]", {
          ticketId: t.id,
          nowTs,
          lastInboundTs,
          lastOutboundTs,
          stalledMinutes: settings.stalled_minutes,
          elapsedMs,
          isStalled,
        });
      }
      if (isStalled) {
        out.set(t.id, { stalled: true, minutes: Math.floor(elapsedMs / 60000) });
      }
    }
    return out;
  }, [ticketsQuery.data, ticketTimelinesQuery.data, settings.stalled_minutes, nowTs]);

  // Refetch leve periódico para garantir frescor da timeline
  useEffect(() => {
    if (!selectedId) return;
    const id = window.setInterval(() => {
      void qc.invalidateQueries({ queryKey: ["messages", selectedId] });
      void qc.invalidateQueries({ queryKey: ["tickets", activeCompanyId] });
    }, 60000);
    return () => window.clearInterval(id);
  }, [selectedId, activeCompanyId, qc]);

  const stalledInfo = useMemo(() => {
    const empty = { stalled: false, minutes: 0, lastInboundAt: null as string | null, lastOutboundAt: null as string | null, hasCustomerWaiting: false };
    if (!selected) return empty;
    const list = visibleMessages;
    let lastInboundTs: number | null = null;
    let lastOutboundTs: number | null = null;
    for (let i = list.length - 1; i >= 0; i--) {
      const ts = new Date(list[i].sent_at || list[i].created_at).getTime();
      if (!Number.isFinite(ts)) continue;
      if (!list[i].from_me && lastInboundTs == null) lastInboundTs = ts;
      if (list[i].from_me && lastOutboundTs == null) lastOutboundTs = ts;
      if (lastInboundTs != null && lastOutboundTs != null) break;
    }
    const hasCustomerWaiting = lastInboundTs != null && (lastOutboundTs == null || lastInboundTs > lastOutboundTs);
    if (lastInboundTs == null || selected.status !== "open" || !selected.assigned_user_id || !hasCustomerWaiting) {
      if (typeof window !== "undefined") {
        console.debug("[STALLED_AUDIT]", {
          ticketId: selected.id,
          assigned_user_id: selected.assigned_user_id,
          unread_count: selected.unread_count,
          lastInboundAt: lastInboundTs ? new Date(lastInboundTs).toISOString() : null,
          lastOutboundAt: lastOutboundTs ? new Date(lastOutboundTs).toISOString() : null,
          hasCustomerWaiting,
          stalledMinutes: settings.stalled_minutes,
          elapsedMinutes: lastInboundTs ? Math.floor((nowTs - lastInboundTs) / 60000) : 0,
          isStalled: false,
        });
      }
      return { ...empty, lastInboundAt: lastInboundTs ? new Date(lastInboundTs).toISOString() : null, lastOutboundAt: lastOutboundTs ? new Date(lastOutboundTs).toISOString() : null, hasCustomerWaiting };
    }
    const elapsedMs = nowTs - lastInboundTs;
    const ageMin = Math.floor(elapsedMs / 60000);
    const stalled = elapsedMs >= settings.stalled_minutes * 60000;
    if (typeof window !== "undefined") {
      console.debug("[STALLED_AUDIT]", {
        ticketId: selected.id,
        assigned_user_id: selected.assigned_user_id,
        unread_count: selected.unread_count,
        lastInboundAt: new Date(lastInboundTs).toISOString(),
        lastOutboundAt: lastOutboundTs ? new Date(lastOutboundTs).toISOString() : null,
        hasCustomerWaiting,
        stalledMinutes: settings.stalled_minutes,
        elapsedMinutes: ageMin,
        isStalled: stalled,
      });
    }
    return {
      stalled,
      minutes: ageMin,
      lastInboundAt: new Date(lastInboundTs).toISOString(),
      lastOutboundAt: lastOutboundTs ? new Date(lastOutboundTs).toISOString() : null,
      hasCustomerWaiting,
    };
  }, [selected, visibleMessages, settings.stalled_minutes, nowTs]);

  // Setor do ticket: também precisa permitir takeover quando regra exige mesmo setor
  const selectedDept = useMemo(
    () => (deptsQuery.data ?? []).find((d) => d.id === selected?.department_id) ?? null,
    [deptsQuery.data, selected?.department_id],
  );

  const canTakeOverStalled = useMemo(() => {
    const ticketDepartmentId = selected?.department_id ?? null;
    const sameDepartment = !!ticketDepartmentId && myDeptIds.includes(ticketDepartmentId);
    const managerOfDepartment = !!ticketDepartmentId && myManagedDeptIds.includes(ticketDepartmentId);
    const departmentAllowsStalledTakeover = selectedDept?.allow_stalled_takeover !== false;
    const companyAllowsStalledTakeover = settings.allow_stalled_takeover === true;
    let canTakeOver = false;
    let reasonBlocked = "allowed";

    if (!selected || !profile?.id) reasonBlocked = "missing_selected_or_user";
    else if (!isAssignedToOther) reasonBlocked = "not_assigned_to_other";
    else if (!stalledInfo.stalled) reasonBlocked = "not_stalled";
    else if (isAdmin || managerOfDepartment) canTakeOver = true;
    else if (!companyAllowsStalledTakeover) reasonBlocked = "company_disallows_stalled_takeover";
    else if (!departmentAllowsStalledTakeover) reasonBlocked = "department_disallows_stalled_takeover";
    else if (settings.same_department_only && !sameDepartment) reasonBlocked = "different_department";
    else canTakeOver = true;

    if (typeof window !== "undefined") {
      console.debug("[STALLED_PERMISSION_AUDIT]", {
        isStalled: stalledInfo.stalled,
        role,
        ticketDepartmentId,
        userDepartmentIds: myDeptIds,
        sameDepartmentOnly: settings.same_department_only,
        departmentAllowsStalledTakeover,
        companyAllowsStalledTakeover,
        canTakeOverStalled: canTakeOver,
        reasonBlocked: canTakeOver ? null : reasonBlocked,
      });
    }
    return canTakeOver;
  }, [
    selected,
    profile?.id,
    isAssignedToOther,
    stalledInfo.stalled,
    isAdmin,
    role,
    settings.allow_stalled_takeover,
    settings.same_department_only,
    selectedDept,
    myDeptIds,
    myManagedDeptIds,
  ]);

  const canTakeOverSelected = canTakeOverPrivileged || canTakeOverStalled;
  const takeOverReason = canTakeOverPrivileged
    ? "assumir_atendimento"
    : "assumir_atendimento_parado";


  // ── Helpers para responder mensagem ────────────────────────────
  const messageTypeLabel = (t?: string | null): string => {
    switch (t) {
      case "image": return "[Imagem]";
      case "audio": return "[Áudio]";
      case "video": return "[Vídeo]";
      case "document": return "[Documento]";
      case "sticker": return "[Sticker]";
      case "location": return "[Localização]";
      case "contact": return "[Contato]";
      default: return "";
    }
  };
  const buildPreview = (m: MessageRow): string => {
    if (m.msg_type && m.msg_type !== "text") {
      const lbl = messageTypeLabel(m.msg_type);
      const cap = m.media_caption ?? m.body ?? "";
      return (cap ? `${lbl} ${cap}` : lbl).slice(0, 280);
    }
    return (m.body ?? "").slice(0, 280);
  };
  const senderLabelFor = (m: MessageRow): string => {
    if (m.from_me) return m.sent_by_name || "Você";
    return selected?.contact?.name || selected?.contact?.phone_number || "Cliente";
  };
  const buildReplyPayload = (m: MessageRow) => ({
    message_id: m.id,
    provider_message_id: m.provider_message_id ?? m.external_id ?? null,
    preview: buildPreview(m),
    sender_name: senderLabelFor(m),
    message_type: m.msg_type ?? "text",
    from_me: m.from_me,
  });

  // ── Reações por emoji ──────────────────────────────────────────
  type ReactionRow = { id: string; message_id: string; user_id: string; emoji: string };
  const reactionsQuery = useQuery({
    queryKey: ["message-reactions", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const ids = (messagesQuery.data ?? []).map((m) => m.id).filter((id) => !id.startsWith("tmp_"));
      if (ids.length === 0) return [] as ReactionRow[];
      const { data, error } = await supabase
        .from("message_reactions")
        .select("id, message_id, user_id, emoji")
        .in("message_id", ids);
      if (error) throw error;
      return (data ?? []) as ReactionRow[];
    },
  });
  useEffect(() => {
    if (!selectedId) return;
    qc.invalidateQueries({ queryKey: ["message-reactions", selectedId] });
  }, [selectedId, messagesQuery.data?.length, qc]);

  const reactionsByMsg = useMemo(() => {
    const map = new Map<string, ReactionRow[]>();
    (reactionsQuery.data ?? []).forEach((r) => {
      const arr = map.get(r.message_id) ?? [];
      arr.push(r);
      map.set(r.message_id, arr);
    });
    return map;
  }, [reactionsQuery.data]);

  const toggleReaction = async (m: MessageRow, emoji: string) => {
    if (!activeCompanyId || !profile?.id || m._optimistic) return;
    const mine = (reactionsByMsg.get(m.id) ?? []).find((r) => r.user_id === profile.id);
    try {
      if (mine && mine.emoji === emoji) {
        await supabase.from("message_reactions").delete().eq("id", mine.id);
      } else if (mine) {
        await supabase.from("message_reactions").update({ emoji }).eq("id", mine.id);
      } else {
        await supabase.from("message_reactions").insert({
          company_id: activeCompanyId, message_id: m.id, user_id: profile.id, emoji,
        });
      }
      qc.invalidateQueries({ queryKey: ["message-reactions", selectedId] });
    } catch (e: any) {
      toast({ title: "Falha ao reagir", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const handleCopyMessage = async (m: MessageRow) => {
    const txt = m.body || m.media_caption || m.media_file_name || "";
    if (!txt) {
      toast({ title: "Nada para copiar", variant: "destructive" });
      return;
    }
    try {
      await navigator.clipboard.writeText(txt);
      toast({ title: "Mensagem copiada" });
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  const handleReplyClick = (m: MessageRow) => {
    if (m._optimistic) return;
    setReplyingTo(m);
    setTimeout(() => composerRef.current?.focus(), 50);
  };

  const sendMutation = useMutation({
    mutationFn: async (vars: { body: string; tempId: string; ticketId: string; reply?: ReturnType<typeof buildReplyPayload> | null }) => {
      if (!activeCompanyId) throw new Error("Empresa não selecionada");
      // Ensure we have a current session before invoking
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        const err: any = new Error("Sua sessão expirou. Faça login novamente.");
        err.code = 401;
        throw err;
      }
      const { data, error } = await supabase.functions.invoke("send-whatsapp-message", {
        body: {
          company_id: activeCompanyId,
          ticket_id: vars.ticketId,
          text: vars.body,
          ...(vars.reply ? { reply: vars.reply } : {}),
        },
      });
      if (error) {
        const status = (error as any)?.context?.status ?? (error as any)?.status;
        const err: any = new Error(error.message || "Falha ao enviar");
        if (status === 401) err.code = 401;
        throw err;
      }
      const d = data as any;
      if (d?.ok === false || d?.error) {
        const detail = d?.detail ? ` — ${d.detail}` : "";
        const err: any = new Error(`[${d?.step ?? "erro"}] ${d?.error ?? "Falha"}${detail}`);
        if (d?.step === "auth") err.code = 401;
        throw err;
      }
      return { data, tempId: vars.tempId, ticketId: vars.ticketId };
    },
    onSuccess: (res) => {
      setTimeout(() => {
        setPendingMessages((prev) => prev.filter((p) => p.tempId !== res.tempId));
      }, 1500);
    },
    onError: (e: any, vars) => {
      setPendingMessages((prev) =>
        prev.map((p) => (p.tempId === vars.tempId ? { ...p, status: "error" } : p)),
      );
      const expired = e?.code === 401;
      toast({
        title: expired
          ? "Sua sessão expirou. Faça login novamente."
          : "Não foi possível enviar a mensagem. Tente novamente.",
        description: expired ? undefined : e.message,
        variant: "destructive",
      });
    },
  });


  const handleSend = () => {
    const v = text.trim();
    if (!v || !selected) return;
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ticketId = selected.id;
    const replySnapshot = replyingTo ? buildReplyPayload(replyingTo) : null;
    setPendingMessages((prev) => [
      ...prev,
      {
        tempId,
        ticketId,
        body: v,
        createdAt: new Date().toISOString(),
        status: "sending",
        reply: replySnapshot,
      } as PendingMessage & { reply?: ReturnType<typeof buildReplyPayload> | null },
    ]);
    setText("");
    setReplyingTo(null);
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
    sendMutation.mutate({ body: v, tempId, ticketId, reply: replySnapshot });
  };

  // ── Envio de mídia ─────────────────────────────────────────────
  const resetAttachInputs = () => {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (documentInputRef.current) documentInputRef.current.value = "";
    if (mediaInputRef.current) mediaInputRef.current.value = "";
    if (audioInputRef.current) audioInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const closeAttachDialog = () => {
    if (attachPreviewUrl) URL.revokeObjectURL(attachPreviewUrl);
    setAttachFile(null);
    setAttachType(null);
    setAttachPreviewUrl(null);
    setAttachCaption("");
    setAttachUploading(false);
    resetAttachInputs();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (FORBIDDEN_EXT.test(file.name)) {
      toast({ title: "Arquivo não permitido", description: "Tipo de arquivo bloqueado por segurança.", variant: "destructive" });
      resetAttachInputs();
      return;
    }
    const type = detectMediaType(file.type);
    if (!type) {
      toast({ title: "Tipo não suportado", description: "Selecione imagem, vídeo, áudio ou documento.", variant: "destructive" });
      resetAttachInputs();
      return;
    }
    const limit = MEDIA_LIMITS[type];
    if (file.size > limit) {
      toast({ title: "Arquivo muito grande para envio.", description: `Limite para ${type}: ${formatBytes(limit)}.`, variant: "destructive" });
      resetAttachInputs();
      return;
    }
    setAttachFile(file);
    setAttachType(type);
    setAttachPreviewUrl(URL.createObjectURL(file));
    setAttachCaption("");
  };

  const handleSendMedia = async () => {
    if (!attachFile || !attachType || !selected || !activeCompanyId) return;
    const file = attachFile;
    const type = attachType;
    const caption = attachCaption.trim() || null;
    const ticketId = selected.id;
    const channelId = selected.channel_id ?? "ch";
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const previewUrl = attachPreviewUrl!;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
    const uuid = (crypto as any).randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const storagePath = `${activeCompanyId}/${channelId}/${ticketId}/temp_${uuid}/${safeName}`;

    setAttachUploading(true);
    // optimistic
    setPendingMessages((prev) => [
      ...prev,
      {
        tempId, ticketId,
        body: caption ?? "",
        createdAt: new Date().toISOString(),
        status: "sending",
        media: { type, fileName: file.name, mimeType: file.type, size: file.size, previewUrl, caption },
      },
    ]);
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));

    try {
      const up = await supabase.storage.from("message-media").upload(storagePath, file, {
        contentType: file.type, upsert: false,
      });
      if (up.error) throw new Error(up.error.message);

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) throw new Error("Sua sessão expirou. Faça login novamente.");

      const { data, error } = await supabase.functions.invoke("send-whatsapp-media", {
        body: {
          company_id: activeCompanyId,
          ticket_id: ticketId,
          media_storage_path: storagePath,
          media_type: type,
          media_mime_type: normalizeMime(file.type),
          media_file_name: file.name,
          media_size: file.size,
          caption,
        },
      });
      if (error) throw new Error(error.message || "Falha ao enviar");
      const d = data as any;
      if (d?.ok === false || d?.error) {
        throw new Error(`[${d?.step ?? "erro"}] ${d?.error ?? "Falha"}${d?.detail ? ` — ${d.detail}` : ""}`);
      }
      // Sucesso: webhook fromMe vai atualizar/dedup; remover otimista após pequena espera.
      setTimeout(() => {
        setPendingMessages((prev) => prev.filter((p) => p.tempId !== tempId));
        URL.revokeObjectURL(previewUrl);
      }, 1500);
      closeAttachDialog();
    } catch (e: any) {
      setPendingMessages((prev) => prev.map((p) => (p.tempId === tempId ? { ...p, status: "error" } : p)));
      toast({
        title: "Não foi possível enviar o arquivo.",
        description: e?.message,
        variant: "destructive",
      });
      setAttachUploading(false);
    }
  };

  // Envio direto (sem dialog) — usado por gravação de áudio
  const sendMediaFileDirect = async (
    file: File,
    type: "image" | "video" | "audio" | "document",
    caption: string | null,
  ) => {
    if (!selected || !activeCompanyId) return;
    if (FORBIDDEN_EXT.test(file.name)) {
      toast({ title: "Arquivo não permitido", description: "Tipo de arquivo bloqueado por segurança.", variant: "destructive" });
      return;
    }
    const limit = MEDIA_LIMITS[type];
    if (file.size > limit) {
      toast({ title: "Arquivo muito grande para envio.", description: `Limite para ${type}: ${formatBytes(limit)}.`, variant: "destructive" });
      return;
    }
    const ticketId = selected.id;
    const channelId = selected.channel_id ?? "ch";
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const previewUrl = URL.createObjectURL(file);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
    const uuid = (crypto as any).randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const storagePath = `${activeCompanyId}/${channelId}/${ticketId}/temp_${uuid}/${safeName}`;

    setPendingMessages((prev) => [
      ...prev,
      {
        tempId, ticketId,
        body: caption ?? "",
        createdAt: new Date().toISOString(),
        status: "sending",
        media: { type, fileName: file.name, mimeType: file.type, size: file.size, previewUrl, caption },
      },
    ]);
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));

    try {
      const up = await supabase.storage.from("message-media").upload(storagePath, file, {
        contentType: file.type, upsert: false,
      });
      if (up.error) throw new Error(up.error.message);
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) throw new Error("Sua sessão expirou. Faça login novamente.");
      const { data, error } = await supabase.functions.invoke("send-whatsapp-media", {
        body: {
          company_id: activeCompanyId,
          ticket_id: ticketId,
          media_storage_path: storagePath,
          media_type: type,
          media_mime_type: normalizeMime(file.type),
          media_file_name: file.name,
          media_size: file.size,
          caption,
        },
      });
      if (error) throw new Error(error.message || "Falha ao enviar");
      const d = data as any;
      if (d?.ok === false || d?.error) {
        throw new Error(`[${d?.step ?? "erro"}] ${d?.error ?? "Falha"}${d?.detail ? ` — ${d.detail}` : ""}`);
      }
      setTimeout(() => {
        setPendingMessages((prev) => prev.filter((p) => p.tempId !== tempId));
        URL.revokeObjectURL(previewUrl);
      }, 1500);
    } catch (e: any) {
      setPendingMessages((prev) => prev.map((p) => (p.tempId === tempId ? { ...p, status: "error" } : p)));
      toast({ title: "Não foi possível enviar o arquivo.", description: e?.message, variant: "destructive" });
    }
  };

  // ── Gravação de áudio ──
  const stopRecorderTracks = () => {
    try { recStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    recStreamRef.current = null;
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
  };

  const pickAudioMime = (): string => {
    const cands = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
    for (const m of cands) {
      if (typeof MediaRecorder !== "undefined" && (MediaRecorder as any).isTypeSupported?.(m)) return m;
    }
    return "audio/webm";
  };

  const startRecording = async () => {
    if (isRecording) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast({ title: "Seu navegador não suporta gravação de áudio.", variant: "destructive" });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recStreamRef.current = stream;
      const mime = pickAudioMime();
      const rec = new MediaRecorder(stream, { mimeType: mime });
      mediaRecorderRef.current = rec;
      recChunksRef.current = [];
      recCancelledRef.current = false;
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) recChunksRef.current.push(e.data); };
      rec.onstop = async () => {
        const wasCancelled = recCancelledRef.current;
        const chunks = recChunksRef.current;
        recChunksRef.current = [];
        stopRecorderTracks();
        setIsRecording(false);
        setRecSeconds(0);
        if (wasCancelled || chunks.length === 0) { setRecSending(false); return; }
        const blob = new Blob(chunks, { type: mime });
        const normalized = normalizeMime(blob.type || mime);
        const ext = normalized.includes("ogg") ? "ogg" : normalized.includes("mp4") ? "m4a" : "webm";
        const fileName = `audio-${Date.now()}.${ext}`;
        const file = new File([blob], fileName, { type: normalized });
        console.log("[AUDIO_RECORD_AUDIT]", { fileName, fileType: file.type, blobType: blob.type, fileSize: file.size });
        setRecSending(true);
        try {
          await sendMediaFileDirect(file, "audio", null);
        } finally {
          setRecSending(false);
        }
      };
      rec.start();
      setIsRecording(true);
      setRecSeconds(0);
      recTimerRef.current = setInterval(() => {
        setRecSeconds((s) => {
          const n = s + 1;
          if (n >= REC_MAX_SECONDS) {
            try { mediaRecorderRef.current?.state === "recording" && mediaRecorderRef.current.stop(); } catch {}
          }
          return n;
        });
      }, 1000);
    } catch (e: any) {
      stopRecorderTracks();
      setIsRecording(false);
      const denied = e?.name === "NotAllowedError" || e?.name === "SecurityError";
      toast({
        title: denied ? "Permissão de microfone negada." : "Não foi possível iniciar a gravação.",
        description: denied ? undefined : e?.message,
        variant: "destructive",
      });
    }
  };

  const cancelRecording = () => {
    if (!isRecording) return;
    recCancelledRef.current = true;
    try { mediaRecorderRef.current?.state === "recording" && mediaRecorderRef.current.stop(); } catch {}
    stopRecorderTracks();
    setIsRecording(false);
    setRecSeconds(0);
  };

  const stopAndSendRecording = () => {
    if (!isRecording) return;
    recCancelledRef.current = false;
    try { mediaRecorderRef.current?.state === "recording" && mediaRecorderRef.current.stop(); } catch {}
  };

  useEffect(() => () => { stopRecorderTracks(); }, []);

  const formatRecTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const ss = (s % 60).toString().padStart(2, "0");
    return `${m}:${ss}`;
  };




  const updateTicket = async (patch: Record<string, any>, successMsg: string) => {
    if (!selected) return;
    const { error } = await (supabase as any).from("tickets").update(patch).eq("id", selected.id);
    if (error) {
      toast({ title: "Falha ao atualizar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: successMsg });
    qc.invalidateQueries({ queryKey: ["tickets", activeCompanyId] });
  };

  const changeStatus = (status: TicketStatus) =>
    updateTicket({ status }, `Atendimento marcado como ${STATUS_LABEL[status].toLowerCase()}.`);

  const saveDepartment = async () => {
    if (!pendingDeptId || !selected) return;
    const previousDeptId = selected.department_id ?? null;
    const previousAssigned = selected.assigned_user_id ?? null;
    const isTransfer = previousDeptId && previousDeptId !== pendingDeptId;
    const ticketId = selected.id;
    const patch: Record<string, any> = {
      department_id: pendingDeptId,
    };
    if (isTransfer) {
      // Transferência entre setores: limpar responsável para cair na fila do novo setor
      patch.assigned_user_id = null;
      patch.assigned_at = null;
      patch.assigned_by = null;
      patch.status = "open";
    } else {
      patch.assigned_at = new Date().toISOString();
      patch.assigned_by = profile?.id ?? null;
    }
    const { error } = await (supabase as any).from("tickets").update(patch).eq("id", ticketId);
    if (error) {
      toast({ title: "Falha ao atualizar", description: error.message, variant: "destructive" });
      return;
    }
    if (isTransfer) {
      const previousDeptName =
        activeDepts.find((d) => d.id === previousDeptId)?.name ?? "Sem setor";
      const newDeptName = activeDepts.find((d) => d.id === pendingDeptId)?.name ?? "novo setor";
      const actorName =
        (profile?.public_name && profile.public_name.trim()) ||
        (profile?.full_name && profile.full_name.trim()) ||
        (profile?.email && profile.email.trim()) ||
        "Usuário";
      // Mensagem de sistema no histórico (NUNCA enviada ao WhatsApp — insert direto em messages).
      try {
        await (supabase as any).from("messages").insert({
          company_id: activeCompanyId,
          ticket_id: ticketId,
          contact_id: selected.contact_id,
          channel_id: selected.channel_id ?? null,
          direction: "outbound",
          msg_type: "text",
          from_me: true,
          body: `${actorName} transferiu o atendimento de ${previousDeptName} para ${newDeptName}.`,
          source: "system",
          sent_by_user_id: profile?.id ?? null,
          sent_by_name: actorName,
          raw: {},
          status: "system",
          delivery_status: "sent",
          sent_at: new Date().toISOString(),
        });
      } catch (e) {
        console.warn("system message (dept transfer) failed", e);
      }
      // Aviso opcional ao cliente via Evolution (somente se configurado).
      try {
        const { data: cs } = await (supabase as any)
          .from("company_settings")
          .select("notify_customer_on_department_transfer")
          .eq("company_id", activeCompanyId)
          .maybeSingle();
        if (cs?.notify_customer_on_department_transfer) {
          const customerText = `Seu atendimento foi encaminhado para o setor ${newDeptName}. Em instantes alguém continuará o atendimento.`;
          await supabase.functions.invoke("send-whatsapp-message", {
            body: {
              company_id: activeCompanyId,
              ticket_id: ticketId,
              text: customerText,
              skip_signature: true,
            },
          });
        }
      } catch (e) {
        console.warn("notify customer on transfer failed", e);
      }
      // Auditoria: troca de setor
      try {
        await (supabase as any).from("audit_logs").insert({
          company_id: activeCompanyId,
          ticket_id: ticketId,
          event_type: "ticket_department_changed",
          previous_assigned_user_id: previousAssigned,
          new_assigned_user_id: null,
          changed_by: profile?.id ?? null,
          reason: "transferencia_setor",
          metadata: {
            previous_department_id: previousDeptId,
            previous_department_name: previousDeptName,
            new_department_id: pendingDeptId,
            new_department_name: newDeptName,
            changed_by_name: actorName,
          },
        });
      } catch (e) {
        console.warn("audit_log dept change failed", e);
      }
      qc.invalidateQueries({ queryKey: ["messages", ticketId] });
      toast({ title: `Atendimento transferido para ${newDeptName}.` });
    } else {
      toast({ title: "Setor definido." });
    }
    qc.invalidateQueries({ queryKey: ["tickets", activeCompanyId] });
    setAssignDeptOpen(false);
    setTransferConfirmOpen(false);
    setPendingDeptId("");
  };

  const handleDeptSaveClick = () => {
    if (!pendingDeptId || !selected) return;
    if (selected.department_id && selected.department_id !== pendingDeptId) {
      setTransferConfirmOpen(true);
      return;
    }
    void saveDepartment();
  };

  const saveAssignee = async () => {
    if (!pendingUserId || !selected) return;
    const previous = selected.assigned_user_id ?? null;
    const ticketId = selected.id;
    await updateTicket(
      { assigned_user_id: pendingUserId, assigned_at: new Date().toISOString(), assigned_by: profile?.id ?? null },
      "Responsável atribuído.",
    );
    await writeAuditLog(ticketId, previous, pendingUserId, "transferencia_manual");
    setAssignUserOpen(false);
    setPendingUserId("");
  };

  // Fase B — Shell mobile mínimo.
  // Em telas pequenas renderiza um layout dedicado que reaproveita os mesmos
  // estados/handlers desta página (zero duplicação de regra de negócio).
  // O JSX desktop abaixo continua intacto.
  if (isMobile) {
    return (
      <TicketsMobileLayout
        tickets={tickets}
        ticketsLoading={ticketsQuery.isLoading}
        ticketsError={ticketsQuery.isError}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        selected={selected}
        visibleMessages={visibleMessages}
        messagesLoading={messagesQuery.isLoading}
        text={text}
        setText={setText}
        handleSend={handleSend}
        filter={filter}
        setFilter={setFilter}
        search={search}
        setSearch={setSearch}
        canSeeGeneralQueue={canSeeGeneralQueue}
        activeDepts={activeDepts}
        deptFilter={deptFilter}
        setDeptFilter={setDeptFilter}
      />
    );
  }

  return (
    <AppLayout title="Atendimentos">
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* List */}
        <div className="w-80 border-r flex flex-col bg-card flex-shrink-0">
          <div className="p-3 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar atendimentos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 bg-secondary border-0"
              />
            </div>

            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={filter === "open" ? "default" : "secondary"}
                className="flex-1 h-9 text-xs"
                onClick={() => setFilter("open")}
              >
                Abertos
              </Button>
              <Button
                size="sm"
                variant={filter === "pending" ? "default" : "secondary"}
                className="flex-1 h-9 text-xs"
                onClick={() => setFilter("pending")}
              >
                Pendentes
              </Button>
              <Button
                size="sm"
                variant={filter === "closed" ? "default" : "secondary"}
                className="flex-1 h-9 text-xs"
                onClick={() => setFilter("closed")}
              >
                Fechados
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant={filter === "todos" || filter === "fila" || filter === "meus" ? "default" : "secondary"}
                    className="h-9 w-9 flex-shrink-0"
                    aria-label="Mais filtros"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => setFilter("todos")}>
                    {filter === "todos" && <Check className="w-3.5 h-3.5 mr-2" />}
                    {filter !== "todos" && <span className="w-3.5 h-3.5 mr-2" />}
                    Todos
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setFilter("fila")}
                    disabled={!canSeeGeneralQueue}
                  >
                    {filter === "fila" && <Check className="w-3.5 h-3.5 mr-2" />}
                    {filter !== "fila" && <span className="w-3.5 h-3.5 mr-2" />}
                    Fila geral
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilter("meus")}>
                    {filter === "meus" && <Check className="w-3.5 h-3.5 mr-2" />}
                    {filter !== "meus" && <span className="w-3.5 h-3.5 mr-2" />}
                    Meus atendimentos
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {activeDepts.length > 0 && (
              <Select value={deptFilter} onValueChange={setDeptFilter}>
                <SelectTrigger className="h-8 bg-secondary border-0 text-xs">
                  <SelectValue placeholder="Setor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os setores</SelectItem>
                  {activeDepts.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
                const isFila = !t.department_id && !t.assigned_user_id;
                const stalledItem = listStalledMap.get(t.id);
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className={`flex items-start gap-3 px-3 py-3 cursor-pointer border-b transition-colors hover:bg-secondary/50 ${selectedId === t.id ? "bg-secondary" : ""}`}
                  >
                    <Avatar className="h-10 w-10 flex-shrink-0">
                      {t.contact?.avatar_url && (
                        <AvatarImage src={t.contact.avatar_url} alt={t.contact?.name ?? ""} />
                      )}
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
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        {isFila && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-primary/30 text-primary">
                            Fila geral
                          </Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground truncate">
                          {t.department?.name ?? "Fila geral"}
                          {" · "}
                          {t.assigned_user_id
                            ? (t.assigned_user_id === profile?.id
                                ? "Você"
                                : (t.assignee?.full_name || t.assignee?.email || "Responsável"))
                            : "Sem responsável"}
                          {" · "}
                          {STATUS_LABEL[t.status]}
                        </span>
                        {stalledItem?.stalled && (
                          <Badge
                            variant="outline"
                            className="text-[10px] h-4 px-1.5 border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10"
                            title={`Sem resposta há ${stalledItem.minutes} min`}
                          >
                            Parado
                          </Badge>
                        )}
                      </div>
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
            {isMobile && selectedMessageId ? (
              <div className="h-12 flex items-center px-2 border-b bg-card gap-1">
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setSelectedMessageId(null)} aria-label="Cancelar seleção">
                  <X className="w-5 h-5" />
                </Button>
                <span className="text-sm font-medium mr-2">1</span>
                <div className="flex-1" />
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Responder" onClick={() => {
                  const m = visibleMessages.find((x) => x.id === selectedMessageId);
                  if (m) { handleReplyClick(m); setSelectedMessageId(null); }
                }}>
                  <CornerUpLeft className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Favoritar" onClick={() => { toast({ title: "Em breve", description: "Favoritos serão implementados em próxima etapa." }); setSelectedMessageId(null); }}>
                  <Star className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Fixar" onClick={() => { toast({ title: "Em breve", description: "Fixar mensagem será implementado em próxima etapa." }); setSelectedMessageId(null); }}>
                  <Pin className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Encaminhar" onClick={() => { toast({ title: "Em breve", description: "Encaminhamento será implementado em próxima etapa." }); setSelectedMessageId(null); }}>
                  <Forward className="w-5 h-5" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Mais opções">
                      <MoreVertical className="w-5 h-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className={`w-48 rounded-xl ${MENU_GLASS_CLASS}`}>
                    <DropdownMenuItem onClick={() => {
                      const m = visibleMessages.find((x) => x.id === selectedMessageId);
                      if (m) { handleCopyMessage(m); setSelectedMessageId(null); }
                    }}>
                      <CopyIcon className="w-4 h-4 mr-2" /> Copiar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { toast({ title: "Em breve", description: "Seleção múltipla será implementada em próxima etapa." }); setSelectedMessageId(null); }}>
                      <SquareCheck className="w-4 h-4 mr-2" /> Selecionar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
            <div className="h-auto py-2 flex items-center justify-between px-4 border-b bg-card gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar className="h-9 w-9">
                  {selected.contact?.avatar_url && (
                    <AvatarImage src={selected.contact.avatar_url} alt={selected.contact?.name ?? ""} />
                  )}
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {initialsOf(selected.contact?.name, selected.contact?.phone_number)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">
                    {selected.contact?.name || selected.contact?.phone_number || "Sem nome"}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <span>{selected.contact?.phone_number || "—"}</span>
                    {selected.protocol_number && (
                      <>
                        <span>·</span>
                        <button
                          type="button"
                          className="font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                          title="Copiar protocolo"
                          onClick={() => {
                            navigator.clipboard?.writeText(selected.protocol_number!).catch(() => {});
                            toast({ title: "Protocolo copiado", description: selected.protocol_number! });
                          }}
                        >
                          Protocolo: {selected.protocol_number}
                        </button>
                      </>
                    )}
                    <span>·</span>
                    <span>Setor: {selected.department?.name ?? "Fila geral"}</span>
                    <span>·</span>
                    <span>
                      Responsável:{" "}
                      {selected.assigned_user_id
                        ? (selected.assigned_user_id === profile?.id
                            ? "Você"
                            : (selected.assignee?.full_name || selected.assignee?.email || "Responsável"))
                        : "Sem responsável"}
                    </span>
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                      {STATUS_LABEL[selected.status]}
                    </Badge>
                    {stalledInfo.stalled && (
                      <Badge
                        variant="outline"
                        className="text-[10px] h-4 px-1.5 border-amber-500/40 text-amber-600 dark:text-amber-400 gap-1"
                        title={`Sem resposta há ${stalledInfo.minutes} min`}
                      >
                        <AlarmClock className="w-3 h-3" />
                        Atendimento parado
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button variant="ghost" size="icon" className="text-muted-foreground h-8 w-8">
                  <Phone className="w-4 h-4" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-muted-foreground h-8 w-8">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Status</DropdownMenuLabel>
                    {selected.status !== "open" && (
                      <DropdownMenuItem onClick={() => changeStatus("open")} disabled={!canEditSelected}>
                        <RotateCcw className="w-4 h-4 mr-2" /> Reabrir atendimento
                      </DropdownMenuItem>
                    )}
                    {selected.status !== "pending" && (
                      <DropdownMenuItem onClick={() => changeStatus("pending")} disabled={!canEditSelected}>
                        <Clock className="w-4 h-4 mr-2" /> Marcar como pendente
                      </DropdownMenuItem>
                    )}
                    {selected.status !== "closed" && (
                      <DropdownMenuItem onClick={() => changeStatus("closed")} disabled={!canEditSelected}>
                        <CheckCircle2 className="w-4 h-4 mr-2" /> Fechar atendimento
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Encaminhamento</DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() => {
                        setPendingDeptId(selected.department_id ?? "");
                        setAssignDeptOpen(true);
                      }}
                      disabled={!canTransferDepartment}
                      title={!canTransferDepartment ? "Você não tem permissão para transferir este atendimento." : undefined}
                    >
                      <Building2 className="w-4 h-4 mr-2" /> {selected.department_id ? "Transferir setor" : "Definir setor"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setPendingUserId(selected.assigned_user_id ?? "");
                        setAssignUserOpen(true);
                      }}
                      disabled={!canAssignUser}
                      title={!canAssignUser ? "Você não tem permissão para atribuir atendente." : undefined}
                    >
                      <UserPlus className="w-4 h-4 mr-2" /> Atribuir atendente
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            )}

            <div className="flex-1 relative">
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="absolute inset-0 overflow-y-auto p-4 space-y-3 bg-secondary/30 scrollbar-thin"
            >
              {messagesQuery.isLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Carregando mensagens...
                </div>
              ) : visibleMessages.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">
                  Nenhuma mensagem ainda
                </div>
              ) : (
                visibleMessages.map((m) => {
                  if (m.source === "system") {
                    return (
                      <div key={m.id} className="flex justify-center">
                        <div className="max-w-[80%] rounded-full bg-muted text-muted-foreground px-3 py-1 text-[11px] text-center italic">
                          {m.body}
                        </div>
                      </div>
                    );
                  }
                  const reactions = reactionsByMsg.get(m.id) ?? [];
                  const reactionCounts = reactions.reduce<Record<string, number>>((acc, r) => {
                    acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
                    return acc;
                  }, {});
                  const myReaction = reactions.find((r) => r.user_id === profile?.id)?.emoji;
                  const replySender = m.reply_to_sender_name;
                  const replyPreview =
                    m.reply_to_message_id
                      ? (() => {
                          const orig = (messagesQuery.data ?? []).find((x) => x.id === m.reply_to_message_id);
                          if (orig) return buildPreview(orig);
                          return m.reply_to_preview ?? null;
                        })()
                      : (m.reply_to_preview ?? null);
                  const hasReply = !!(m.reply_to_message_id || m.reply_to_preview);
                  const replyUnavailable = hasReply && !replyPreview;
                  return (
                  <div key={m.id} className={`group/msg flex ${m.from_me ? "justify-end" : "justify-start"}`}>
                    <div className="relative max-w-[70%]">
                      {/* Mobile reaction strip when selected */}
                      {isMobile && selectedMessageId === m.id && !m._optimistic && m.source !== "system" && (
                        <div className={`absolute -top-12 z-20 ${m.from_me ? "right-0" : "left-0"} ${MENU_GLASS_CLASS} rounded-full p-1 flex items-center gap-0.5 animate-in fade-in zoom-in-95`}>
                          {["👍","❤️","😂","😮","😢","🙏"].map((emo) => (
                            <button
                              key={emo}
                              type="button"
                              onClick={() => { toggleReaction(m, emo); setSelectedMessageId(null); }}
                              className={`text-base h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center ${myReaction === emo ? "bg-muted" : ""}`}
                            >
                              {emo}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => toast({ title: "Em breve", description: "Seletor completo de emojis em breve." })}
                            className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center text-slate-500"
                            aria-label="Mais emojis"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      <div
                        onTouchStart={() => startLongPress(m.id)}
                        onTouchEnd={clearLongPress}
                        onTouchMove={clearLongPress}
                        onTouchCancel={clearLongPress}
                        className={`rounded-2xl px-4 py-2.5 ${
                          m.from_me
                            ? "bg-primary text-primary-foreground rounded-br-md"
                            : "bg-card text-foreground shadow-card rounded-bl-md"
                        } ${m.status === "error" ? "ring-1 ring-destructive" : ""} ${
                          isMobile && selectedMessageId === m.id ? "ring-2 ring-primary/60" : ""
                        }`}
                      >
                        {hasReply && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!m.reply_to_message_id) return;
                              const el = document.getElementById(`msg-${m.reply_to_message_id}`);
                              if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                            }}
                            className={`w-full text-left mb-1.5 rounded-md px-2 py-1 border-l-2 ${
                              m.from_me
                                ? "bg-primary-foreground/10 border-primary-foreground/50"
                                : "bg-muted border-primary/50"
                            }`}
                          >
                            <div className={`text-[11px] font-medium ${m.from_me ? "text-primary-foreground/90" : "text-primary"}`}>
                              {replySender || "Mensagem"}
                            </div>
                            <div className={`text-[11px] truncate ${m.from_me ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                              {replyUnavailable ? "Mensagem original indisponível" : replyPreview}
                            </div>
                          </button>
                        )}
                        <div id={`msg-${m.id}`}>
                        {(() => {
                          const mediaTypes = ["image", "audio", "video", "document", "sticker"];
                          const isMedia = mediaTypes.includes(m.msg_type);
                          const caption = m.media_caption ?? (isMedia ? m.body : null);
                          return (
                            <>
                              {isMedia && (
                                <div className="mb-1">
                                  <MediaContent m={m} onMime={(mime) => mime?.split("/")[1]?.toUpperCase() ?? ""} />
                                </div>
                              )}
                              {(isMedia ? caption : m.body) ? (
                                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                                  {isMedia ? caption : m.body}
                                </p>
                              ) : isMedia ? null : (
                                <p className="text-sm italic opacity-70">[{m.msg_type}]</p>
                              )}
                            </>
                          );
                        })()}
                        </div>
                        {m.from_me && m.source === "whatsapp_device" && (
                          <div
                            className="text-[10px] mt-1 opacity-70 italic"
                            title="Mensagem enviada diretamente pelo WhatsApp conectado"
                          >
                            Enviado pelo WhatsApp
                          </div>
                        )}
                        <div
                          className={`flex items-center justify-end gap-1 mt-1 ${m.from_me ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                        >
                          {m.is_edited && (
                            <span className="text-[10px] italic opacity-70" title={m.edited_at ? `Editada em ${fmtTime(m.edited_at)}` : "Editada"}>
                              Editada
                            </span>
                          )}
                          <span className="text-[10px]">{fmtTime(m.sent_at || m.created_at)}</span>
                          {m.from_me && (() => {
                            const ds = m._optimistic
                              ? (m.status === "error" ? "failed" : "sending")
                              : (m.delivery_status || m.status || "sent");
                            if (ds === "failed") {
                              return <AlertCircle className="w-3.5 h-3.5 text-destructive" aria-label="Falhou" />;
                            }
                            if (ds === "read") {
                              return <CheckCheck className="w-3.5 h-3.5 text-sky-300" aria-label="Lida" />;
                            }
                            if (ds === "sending") {
                              return <Check className="w-3.5 h-3.5 opacity-60" aria-label="Enviando" />;
                            }
                            if (ds === "delivered") {
                              return <CheckCheck className="w-3.5 h-3.5 opacity-90" aria-label="Entregue" />;
                            }
                            return <CheckCheck className="w-3.5 h-3.5 opacity-90" aria-label="Enviada" />;
                          })()}
                        </div>
                        {m.from_me && !m._optimistic && (m.delivery_status === "failed" || m.status === "failed") && (
                          <div className="mt-1 flex items-center justify-end gap-2">
                            {m.failure_reason ? (
                              <span className="text-[10px] text-destructive/90 truncate max-w-[180px]" title={m.failure_reason}>
                                {m.failure_reason}
                              </span>
                            ) : null}
                            <button
                              type="button"
                              className="text-[11px] underline text-destructive hover:opacity-80"
                              onClick={async () => {
                                try {
                                  const { error } = await supabase.functions.invoke("retry-scheduled-message", {
                                    body: { message_id: m.id },
                                  });
                                  if (error) throw error;
                                  toast({ title: "Reenfileirado para envio" });
                                } catch (e: any) {
                                  toast({ title: "Falha ao reenviar", description: e?.message ?? String(e), variant: "destructive" });
                                }
                              }}
                            >
                              Tentar novamente
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Reactions chip (visible when any) */}
                      {Object.keys(reactionCounts).length > 0 && (
                        <div className={`mt-1 flex flex-wrap gap-1 ${m.from_me ? "justify-end" : "justify-start"}`}>
                          {Object.entries(reactionCounts).map(([emo, count]) => (
                            <button
                              key={emo}
                              type="button"
                              onClick={() => toggleReaction(m, emo)}
                              className={`text-[11px] leading-none rounded-full px-2 py-0.5 border bg-card hover:bg-muted ${
                                myReaction === emo ? "border-primary/60 ring-1 ring-primary/30" : "border-border"
                              }`}
                              title={myReaction === emo ? "Remover reação" : "Reagir"}
                            >
                              <span className="mr-1">{emo}</span>
                              <span className="text-muted-foreground">{count}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Hover actions: emoji reactions + dropdown */}
                      {!m._optimistic && m.source !== "system" && (
                        <div
                          className={`absolute top-1 ${m.from_me ? "left-0 -translate-x-full pl-0 pr-2" : "right-0 translate-x-full pl-2"} opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100 transition-opacity hidden md:flex items-center gap-1`}
                        >
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                aria-label="Reagir"
                                className="h-7 w-7 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-center text-slate-500 hover:text-slate-700"
                              >
                                <Smile className="w-3.5 h-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align={m.from_me ? "end" : "start"} className={`p-1 rounded-full flex items-center gap-0.5 ${MENU_GLASS_CLASS}`}>
                              {["👍","❤️","😂","😮","😢","🙏"].map((emo) => (
                                <button
                                  key={emo}
                                  type="button"
                                  onClick={() => toggleReaction(m, emo)}
                                  className={`text-base h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center ${myReaction === emo ? "bg-muted" : ""}`}
                                >
                                  {emo}
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() => toast({ title: "Em breve", description: "Seletor completo de emojis em breve." })}
                                className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center text-slate-500"
                                aria-label="Mais emojis"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </DropdownMenuContent>
                          </DropdownMenu>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                aria-label="Mais ações"
                                className="h-7 w-7 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-center text-slate-500 hover:text-slate-700"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align={m.from_me ? "end" : "start"} className={`w-48 rounded-xl ${MENU_GLASS_CLASS}`}>
                              <DropdownMenuItem onClick={() => handleReplyClick(m)}>
                                <CornerUpLeft className="w-4 h-4 mr-2" /> Responder
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleCopyMessage(m)}>
                                <CopyIcon className="w-4 h-4 mr-2" /> Copiar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => toast({ title: "Em breve", description: "Encaminhamento será implementado em próxima etapa." })}
                              >
                                <Forward className="w-4 h-4 mr-2" /> Encaminhar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => toast({ title: "Em breve", description: "Fixar mensagem será implementado em próxima etapa." })}
                              >
                                <Pin className="w-4 h-4 mr-2" /> Fixar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => toast({ title: "Em breve", description: "Favoritos serão implementados em próxima etapa." })}
                              >
                                <Star className="w-4 h-4 mr-2" /> Favoritar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => toast({ title: "Em breve", description: "Seleção múltipla será implementada em próxima etapa." })}
                              >
                                <SquareCheck className="w-4 h-4 mr-2" /> Selecionar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })

              )}
              <div ref={endRef} />
            </div>
            {!isNearBottom && (
              <button
                type="button"
                onClick={() => scrollToBottom("smooth")}
                aria-label="Ir para o fim da conversa"
                className="absolute bottom-4 right-4 z-10 h-9 w-9 rounded-full bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-sm backdrop-blur text-slate-500 dark:text-slate-300 hover:bg-white hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100 flex items-center justify-center transition-colors"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            )}
            </div>

            <div className="p-3 border-t bg-card">
              {selected.status === "closed" ? (
                <div className="text-center text-sm text-muted-foreground py-2">
                  Este atendimento está fechado. Reabra para enviar mensagens.
                </div>
              ) : isPendingAcceptance ? (
                <div className="flex flex-col items-center gap-2 py-2 text-center">
                  <p className="text-sm text-muted-foreground">
                    Este atendimento ainda não foi iniciado.
                    <br />
                    Aceite o atendimento para responder ao cliente.
                  </p>
                  <Button
                    onClick={() => acceptMutation.mutate()}
                    disabled={!canAcceptSelected || acceptMutation.isPending}
                    className="gradient-primary text-primary-foreground rounded-full px-5"
                  >
                    {acceptMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <UserPlus className="w-4 h-4 mr-2" />
                    )}
                    Aceitar atendimento
                  </Button>
                </div>
              ) : isAssignedToOther ? (
                <div className="flex flex-col items-center gap-2 py-2 text-center">
                  {stalledInfo.stalled ? (
                    <p className="text-sm text-foreground">
                      Este atendimento está parado há mais de{" "}
                      <span className="font-medium">{stalledInfo.minutes} min</span>.
                      {canTakeOverStalled ? " Você pode assumir para responder ao cliente." : ""}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Este atendimento está sendo realizado por{" "}
                      <span className="font-medium text-foreground">
                        {selected.assignee?.full_name || selected.assignee?.email || "outro atendente"}
                      </span>
                      .
                    </p>
                  )}
                  {canTakeOverSelected ? (
                    <Button
                      onClick={() => setTakeOverOpen(true)}
                      disabled={takeOverMutation.isPending}
                      variant="outline"
                      className="rounded-full px-5"
                    >
                      <UserPlus className="w-4 h-4 mr-2" />
                      Assumir atendimento
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Você não tem permissão para enviar mensagens neste atendimento.
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {replyingTo && (
                    <div className="flex items-start gap-2 rounded-md border-l-2 border-primary/60 bg-muted/60 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium text-primary">
                          Respondendo {senderLabelFor(replyingTo)}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {buildPreview(replyingTo) || messageTypeLabel(replyingTo.msg_type) || "Mensagem"}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => setReplyingTo(null)}
                        aria-label="Cancelar resposta"
                        title="Cancelar resposta"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                  <input ref={fileInputRef} type="file" accept={ACCEPT_TYPES} className="hidden" onChange={handleFileSelected} />
                  <input ref={documentInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.odt,.ods,.odp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv" className="hidden" onChange={handleFileSelected} />
                  <input ref={mediaInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileSelected} />
                  <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileSelected} />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    {...({ capture: "environment" } as any)}
                    className="hidden"
                    onChange={handleFileSelected}
                  />

                  {isRecording ? (
                    <div className="flex items-center gap-2 w-full">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-full flex-shrink-0 text-destructive"
                        onClick={cancelRecording}
                        aria-label="Cancelar gravação"
                        title="Cancelar"
                      >
                        <Trash2 className="w-5 h-5" />
                      </Button>
                      <div className="flex-1 h-10 rounded-full bg-secondary px-4 flex items-center gap-3 text-sm">
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
                        <span className="text-muted-foreground">Gravando…</span>
                        <span className="ml-auto tabular-nums font-medium">{formatRecTime(recSeconds)}</span>
                      </div>
                      <Button
                        type="button"
                        onClick={stopAndSendRecording}
                        size="icon"
                        className="gradient-primary text-primary-foreground h-10 w-10 rounded-full flex-shrink-0"
                        aria-label="Enviar gravação"
                        title="Enviar"
                        disabled={recSending}
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 rounded-full flex-shrink-0 text-muted-foreground hover:text-foreground"
                            aria-label="Anexar"
                            title="Anexar"
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
                          <DropdownMenuItem
                            onClick={() => toast({ title: "Em breve", description: "Envio de contato será adicionado em breve." })}
                          >
                            <UserIcon className="w-4 h-4 mr-2" /> Contato
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => toast({ title: "Em breve", description: "Envio de enquete será adicionado em breve." })}
                          >
                            <BarChart3 className="w-4 h-4 mr-2" /> Enquete
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              if (!selected) return;
                              setEventModalOpen(true);
                            }}
                            disabled={!selected}
                          >
                            <CalendarPlus className="w-4 h-4 mr-2" /> Evento
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <QuickRepliesPopover
                        disabled={!selected}
                        contactName={selected?.contact?.name ?? null}
                        protocol={(selected as any)?.protocol_number ?? null}
                        onInsert={(snippet) =>
                          setText((prev) =>
                            prev.trim().length === 0 ? snippet : `${prev}\n${snippet}`,
                          )
                        }
                      />

                      <Textarea
                        ref={composerRef}
                        placeholder="Digite uma mensagem..."
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => {
                          // Enter envia; Shift+Enter quebra linha.
                          // No mobile (sem teclado físico) Enter sempre quebra linha.
                          const isTouch =
                            typeof window !== "undefined" &&
                            window.matchMedia?.("(pointer: coarse)").matches;
                          if (
                            e.key === "Enter" &&
                            !e.shiftKey &&
                            !e.nativeEvent.isComposing &&
                            !isTouch
                          ) {
                            e.preventDefault();
                            if (sendMutation.isPending) return;
                            if (text.trim().length === 0) return;
                            handleSend();
                          }
                        }}
                        rows={1}
                        className="flex-1 min-h-10 max-h-40 bg-secondary border-0 rounded-2xl px-4 py-2 resize-none"
                      />
                      {text.trim().length === 0 ? (
                        <Button
                          type="button"
                          onClick={startRecording}
                          size="icon"
                          className="gradient-primary text-primary-foreground h-10 w-10 rounded-full flex-shrink-0"
                          aria-label="Gravar áudio"
                          title="Gravar áudio"
                        >
                          <Mic className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button
                          onClick={handleSend}
                          size="icon"
                          className="gradient-primary text-primary-foreground h-10 w-10 rounded-full flex-shrink-0"
                          aria-label="Enviar"
                          title="Enviar"
                        >
                          <Send className="w-4 h-4" />
                        </Button>
                      )}
                    </>
                  )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-secondary/20">
            <div className="text-center px-6">
              <MessageSquare className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">Selecione um atendimento para visualizar a conversa.</p>
            </div>
          </div>
        )}
      </div>

      {/* Dialog: Definir setor */}
      <Dialog open={assignDeptOpen} onOpenChange={setAssignDeptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.department_id ? "Transferir atendimento para outro setor" : "Definir setor do atendimento"}</DialogTitle>
            <DialogDescription>{selected?.department_id ? "Escolha o novo setor responsável. O atendimento será movido para a fila do novo setor." : "Escolha o setor responsável por este atendimento."}</DialogDescription>
          </DialogHeader>
          <Select value={pendingDeptId} onValueChange={setPendingDeptId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um setor" />
            </SelectTrigger>
            <SelectContent>
              {activeDepts.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignDeptOpen(false)}>Cancelar</Button>
            <Button onClick={handleDeptSaveClick} disabled={!pendingDeptId}>
              {selected?.department_id && selected.department_id !== pendingDeptId ? "Transferir" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm: Transferir entre setores */}
      <AlertDialog open={transferConfirmOpen} onOpenChange={setTransferConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Transferir atendimento para {activeDepts.find((d) => d.id === pendingDeptId)?.name ?? "novo setor"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Após a transferência, o atendimento ficará disponível para o novo setor e será removido da fila do setor atual. O responsável atual será removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void saveDepartment();
              }}
            >
              Transferir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: Atribuir atendente */}
      <Dialog open={assignUserOpen} onOpenChange={setAssignUserOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atribuir atendente</DialogTitle>
            <DialogDescription>
              {selected?.department_id
                ? "Apenas atendentes do setor são listados."
                : "Defina um setor primeiro para filtrar atendentes (opcional)."}
            </DialogDescription>
          </DialogHeader>
          {assignableUsersQuery.isLoading ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Carregando...
            </div>
          ) : (
            <Select value={pendingUserId} onValueChange={setPendingUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um atendente" />
              </SelectTrigger>
              <SelectContent>
                {(assignableUsersQuery.data ?? []).map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    {u.full_name || u.email || u.user_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignUserOpen(false)}>Cancelar</Button>
            <Button onClick={saveAssignee} disabled={!pendingUserId}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Confirm: Assumir atendimento */}
      <AlertDialog open={takeOverOpen} onOpenChange={setTakeOverOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Assumir atendimento</AlertDialogTitle>
            <AlertDialogDescription>
              Este atendimento está sendo realizado por{" "}
              <span className="font-medium text-foreground">
                {selected?.assignee?.full_name || selected?.assignee?.email || "outro atendente"}
              </span>
              . Deseja assumir o controle desta conversa?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={takeOverMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                takeOverMutation.mutate(takeOverReason);
              }}
              disabled={takeOverMutation.isPending}
            >
              {takeOverMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Assumir atendimento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Dialog: Preview e envio de mídia */}
      <Dialog
        open={!!attachFile}
        onOpenChange={(open) => {
          if (!open && !attachUploading) closeAttachDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar arquivo</DialogTitle>
            <DialogDescription>
              {attachType === "image" && "Imagem"}
              {attachType === "video" && "Vídeo"}
              {attachType === "audio" && "Áudio"}
              {attachType === "document" && "Documento"}
              {" · "}
              {attachFile && formatBytes(attachFile.size)}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            {attachType === "image" && attachPreviewUrl && (
              <img src={attachPreviewUrl} alt="preview" className="max-h-64 rounded-lg object-contain mx-auto" />
            )}
            {attachType === "video" && attachPreviewUrl && (
              <video src={attachPreviewUrl} controls className="max-h-64 rounded-lg w-full" />
            )}
            {attachType === "audio" && attachPreviewUrl && (
              <audio src={attachPreviewUrl} controls className="w-full" />
            )}
            {attachType === "document" && attachFile && (
              <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-3">
                <FileText className="w-8 h-8 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{attachFile.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {attachFile.type || "documento"} · {formatBytes(attachFile.size)}
                  </div>
                </div>
              </div>
            )}

            {attachType !== "audio" && (
              <Input
                placeholder="Legenda (opcional)"
                value={attachCaption}
                maxLength={1024}
                onChange={(e) => setAttachCaption(e.target.value)}
                disabled={attachUploading}
              />
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={closeAttachDialog} disabled={attachUploading}>
              Cancelar
            </Button>
            <Button onClick={handleSendMedia} disabled={attachUploading}>
              {attachUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selected && (
        <EventModal
          open={eventModalOpen}
          onOpenChange={setEventModalOpen}
          context={{
            mode: "ticket",
            ticket_id: selected.id,
            contact_id: selected.contact_id,
            channel_id: selected.channel_id ?? undefined,
            contactLabel: selected.contact?.name ?? selected.contact?.phone_number ?? undefined,
          }}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ["messages", selected.id] });
          }}
        />
      )}
    </AppLayout>
  );
};

export default TicketsDesktopLayout;
