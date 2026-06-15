import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  department_id: string | null;
  assigned_user_id: string | null;
  contact: { id: string; name: string | null; phone_number: string | null; avatar_url: string | null } | null;
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
  sent_at: string;
  created_at: string;
  source?: string | null;
  sent_by_name?: string | null;
  media_mime_type?: string | null;
  media_file_name?: string | null;
  media_size?: number | null;
  media_duration?: number | null;
  media_caption?: string | null;
  media_storage_path?: string | null;
  media_url?: string | null;
  _optimistic?: boolean;
}


interface PendingMessage {
  tempId: string;
  ticketId: string;
  body: string;
  createdAt: string;
  status: "sending" | "error";
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

const Tickets = () => {
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [assignDeptOpen, setAssignDeptOpen] = useState(false);
  const [assignUserOpen, setAssignUserOpen] = useState(false);
  const [takeOverOpen, setTakeOverOpen] = useState(false);
  const [transferConfirmOpen, setTransferConfirmOpen] = useState(false);
  const [pendingDeptId, setPendingDeptId] = useState<string>("");
  const [pendingUserId, setPendingUserId] = useState<string>("");
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

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
          "id, company_id, contact_id, channel_id, status, unread_count, last_message_at, subject, department_id, assigned_user_id, contact:contacts(id, name, phone_number, avatar_url), department:departments(id, name)",
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

  // Zera unread_count ao abrir a conversa (banco + cache + selected).
  useEffect(() => {
    if (!selectedId || !activeCompanyId) return;
    const t = tickets.find((x) => x.id === selectedId);
    if (!t || (t.unread_count ?? 0) <= 0) return;

    // Atualiza cache local imediatamente (todas as queries de tickets desta empresa).
    qc.setQueriesData<TicketRow[]>(
      { queryKey: ["tickets", activeCompanyId] },
      (old) =>
        Array.isArray(old)
          ? old.map((x) => (x.id === selectedId ? { ...x, unread_count: 0 } : x))
          : old,
    );

    // Persiste no banco com filtro por empresa.
    (async () => {
      const { error } = await (supabase as any)
        .from("tickets")
        .update({ unread_count: 0 })
        .eq("id", selectedId)
        .eq("company_id", activeCompanyId);
      if (error) {
        // Em caso de erro, recarrega para refletir estado real.
        qc.invalidateQueries({ queryKey: ["tickets", activeCompanyId] });
      }
    })();
  }, [selectedId, activeCompanyId, tickets, qc]);

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

  // unread_count só zera ao aceitar — não zerar apenas por visualizar.

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
        .select("id, ticket_id, direction, from_me, body, msg_type, status, delivery_status, sent_at, created_at, source, sent_by_name, media_mime_type, media_file_name, media_size, media_duration, media_caption, media_storage_path, media_url")
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
    const optimistic: MessageRow[] = pendingForSelected.map((p) => ({
      id: p.tempId,
      ticket_id: p.ticketId,
      direction: "outbound",
      from_me: true,
      body: p.body,
      msg_type: "text",
      status: p.status === "error" ? "error" : "sending",
      sent_at: p.createdAt,
      created_at: p.createdAt,
      _optimistic: true,
    }));
    return [...real, ...optimistic];
  }, [messagesQuery.data, pendingForSelected]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleMessages.length, selectedId]);

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


  const sendMutation = useMutation({
    mutationFn: async (vars: { body: string; tempId: string; ticketId: string }) => {
      if (!activeCompanyId) throw new Error("Empresa não selecionada");
      // Ensure we have a current session before invoking
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        const err: any = new Error("Sua sessão expirou. Faça login novamente.");
        err.code = 401;
        throw err;
      }
      const { data, error } = await supabase.functions.invoke("send-whatsapp-message", {
        body: { company_id: activeCompanyId, ticket_id: vars.ticketId, text: vars.body },
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
    setPendingMessages((prev) => [
      ...prev,
      { tempId, ticketId, body: v, createdAt: new Date().toISOString(), status: "sending" },
    ]);
    setText("");
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
    sendMutation.mutate({ body: v, tempId, ticketId });
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
            <div className="h-auto py-2 flex items-center justify-between px-4 border-b bg-card gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar className="h-9 w-9">
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

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-secondary/30 scrollbar-thin">
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
                  return (
                  <div key={m.id} className={`flex ${m.from_me ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                        m.from_me
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-card text-foreground shadow-card rounded-bl-md"
                      } ${m.status === "error" ? "ring-1 ring-destructive" : ""}`}
                    >
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
                          // sent (e fallback) → 2 checks discretos = Enviada
                          return <CheckCheck className="w-3.5 h-3.5 opacity-90" aria-label="Enviada" />;

                        })()}
                      </div>
                    </div>
                  </div>
                  );
                })

              )}
              <div ref={endRef} />
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
                    disabled={!text.trim()}
                    size="icon"
                    className="gradient-primary text-primary-foreground h-10 w-10 rounded-full flex-shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
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
    </AppLayout>
  );
};

export default Tickets;
