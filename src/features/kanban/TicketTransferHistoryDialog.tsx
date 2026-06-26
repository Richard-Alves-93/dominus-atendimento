import { useEffect, useMemo, useState } from "react";
import { Loader2, ArrowRightLeft, Clock, CheckCircle2, RotateCcw, XCircle, AlertCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

type Status = "pending" | "accepted" | "returned" | "skipped" | "canceled" | string;

const STATUS_LABEL: Record<string, string> = {
  pending: "Aguardando assumir",
  accepted: "Assumido",
  returned: "Retornado",
  skipped: "Ignorado",
  canceled: "Cancelado",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "secondary",
  accepted: "default",
  returned: "outline",
  skipped: "outline",
  canceled: "destructive",
};

const RETURN_TARGET_LABEL: Record<string, string> = {
  previous_user: "Atendente anterior",
  origin_department: "Setor de origem",
};

type Transfer = {
  id: string;
  ticket_id: string;
  company_id: string;
  from_department_id: string | null;
  to_department_id: string | null;
  from_user_id: string | null;
  transferred_by: string | null;
  accepted_by: string | null;
  accepted_at: string | null;
  returned_at: string | null;
  returned_to_user_id: string | null;
  return_deadline_at: string | null;
  return_target: string | null;
  return_if_unassigned: boolean | null;
  source: string | null;
  status: Status;
  created_at: string;
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch { return "—"; }
}

function statusIcon(s: Status) {
  switch (s) {
    case "accepted": return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case "returned": return <RotateCcw className="h-4 w-4 text-amber-600" />;
    case "canceled": return <XCircle className="h-4 w-4 text-destructive" />;
    case "skipped":  return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    default:         return <Clock className="h-4 w-4 text-blue-600" />;
  }
}

export function TicketTransferHistoryDialog({
  open, onClose, ticketId, companyId,
}: {
  open: boolean;
  onClose: () => void;
  ticketId: string | null;
  companyId: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [deptNames, setDeptNames] = useState<Record<string, string>>({});
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !ticketId || !companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: e } = await (supabase as any)
        .from("ticket_transfers")
        .select("id,ticket_id,company_id,from_department_id,to_department_id,from_user_id,transferred_by,accepted_by,accepted_at,returned_at,returned_to_user_id,return_deadline_at,return_target,return_if_unassigned,source,status,created_at")
        .eq("ticket_id", ticketId)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (e) {
        setError(e.message);
        setLoading(false);
        return;
      }
      const list: Transfer[] = data ?? [];
      setTransfers(list);

      const deptIds = new Set<string>();
      const userIds = new Set<string>();
      for (const t of list) {
        if (t.from_department_id) deptIds.add(t.from_department_id);
        if (t.to_department_id) deptIds.add(t.to_department_id);
        for (const u of [t.from_user_id, t.transferred_by, t.accepted_by, t.returned_to_user_id]) {
          if (u) userIds.add(u);
        }
      }
      const [{ data: depts }, { data: profs }] = await Promise.all([
        deptIds.size
          ? (supabase as any).from("departments").select("id,name").in("id", Array.from(deptIds))
          : Promise.resolve({ data: [] }),
        userIds.size
          ? (supabase as any).from("profiles").select("id,full_name").in("id", Array.from(userIds))
          : Promise.resolve({ data: [] }),
      ]);
      if (cancelled) return;
      const dn: Record<string, string> = {};
      for (const d of (depts ?? [])) dn[d.id] = d.name;
      const un: Record<string, string> = {};
      for (const p of (profs ?? [])) un[p.id] = p.full_name ?? "Usuário";
      setDeptNames(dn);
      setUserNames(un);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, ticketId, companyId]);

  const empty = !loading && transfers.length === 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            Histórico de transferências
          </DialogTitle>
          <DialogDescription>
            Movimentações operacionais deste atendimento pelo Kanban.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando histórico...
          </div>
        ) : error ? (
          <div className="text-sm text-destructive py-4">Erro ao carregar: {error}</div>
        ) : empty ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            Nenhuma transferência registrada para este atendimento.
          </div>
        ) : (
          <ol className="relative border-l border-border ml-2 pl-4 space-y-4 max-h-[60vh] overflow-y-auto">
            {transfers.map((t) => {
              const from = t.from_department_id ? (deptNames[t.from_department_id] ?? "Setor") : "—";
              const to = t.to_department_id ? (deptNames[t.to_department_id] ?? "Setor") : "—";
              return (
                <li key={t.id} className="relative">
                  <span className="absolute -left-[22px] top-1 bg-background rounded-full">
                    {statusIcon(t.status)}
                  </span>
                  <div className="rounded-md border bg-card p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-sm font-medium">
                        Transferido para <span className="text-primary">{to}</span>
                      </div>
                      <Badge variant={STATUS_VARIANT[t.status] ?? "outline"} className="text-[10px]">
                        {STATUS_LABEL[t.status] ?? t.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {fmtDate(t.created_at)} · Origem: {t.source === "kanban" ? "Kanban" : (t.source ?? "—")}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs pt-1">
                      <div><span className="text-muted-foreground">Setor de origem:</span> {from}</div>
                      <div><span className="text-muted-foreground">Setor de destino:</span> {to}</div>
                      <div>
                        <span className="text-muted-foreground">Atendente anterior:</span>{" "}
                        {t.from_user_id ? (userNames[t.from_user_id] ?? "—") : "—"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Transferido por:</span>{" "}
                        {t.transferred_by ? (userNames[t.transferred_by] ?? "—") : "—"}
                      </div>
                      {t.return_if_unassigned && (
                        <>
                          <div>
                            <span className="text-muted-foreground">Prazo de retorno:</span>{" "}
                            {fmtDate(t.return_deadline_at)}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Destino do retorno:</span>{" "}
                            {t.return_target ? (RETURN_TARGET_LABEL[t.return_target] ?? t.return_target) : "—"}
                          </div>
                        </>
                      )}
                      {t.status === "accepted" && (
                        <>
                          <div>
                            <span className="text-muted-foreground">Assumido por:</span>{" "}
                            {t.accepted_by ? (userNames[t.accepted_by] ?? "—") : "—"}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Assumido em:</span>{" "}
                            {fmtDate(t.accepted_at)}
                          </div>
                        </>
                      )}
                      {t.status === "returned" && (
                        <>
                          <div>
                            <span className="text-muted-foreground">Retornou para:</span>{" "}
                            {t.returned_to_user_id
                              ? (userNames[t.returned_to_user_id] ?? "Atendente anterior")
                              : (t.from_department_id ? (deptNames[t.from_department_id] ?? "Setor de origem") : "Setor de origem")}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Retornou em:</span>{" "}
                            {fmtDate(t.returned_at)}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Hook leve que busca o status da transferência mais recente para uma lista de tickets. */
export function useLatestTransfers(companyId: string | null, ticketIds: string[]) {
  const [map, setMap] = useState<Record<string, Transfer>>({});
  const key = useMemo(() => ticketIds.slice().sort().join(","), [ticketIds]);

  useEffect(() => {
    if (!companyId || ticketIds.length === 0) {
      setMap({});
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("ticket_transfers")
        .select("id,ticket_id,company_id,from_department_id,to_department_id,from_user_id,transferred_by,accepted_by,accepted_at,returned_at,returned_to_user_id,return_deadline_at,return_target,return_if_unassigned,source,status,created_at")
        .eq("company_id", companyId)
        .in("ticket_id", ticketIds)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      const latest: Record<string, Transfer> = {};
      for (const t of (data ?? []) as Transfer[]) {
        if (!latest[t.ticket_id]) latest[t.ticket_id] = t;
      }
      setMap(latest);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, key]);

  return map;
}

export function TransferStatusBadge({ transfer }: { transfer: Transfer | undefined }) {
  if (!transfer) return null;
  if (transfer.status === "pending") {
    if (transfer.return_deadline_at) {
      const ms = new Date(transfer.return_deadline_at).getTime() - Date.now();
      if (ms > 0) {
        const mins = Math.max(1, Math.round(ms / 60000));
        return <Badge variant="secondary" className="text-[9px] px-1 py-0">Retorna em {mins} min</Badge>;
      }
    }
    return <Badge variant="secondary" className="text-[9px] px-1 py-0">Transferido</Badge>;
  }
  if (transfer.status === "accepted") {
    return <Badge variant="default" className="text-[9px] px-1 py-0">Assumido no destino</Badge>;
  }
  if (transfer.status === "returned") {
    return <Badge variant="outline" className="text-[9px] px-1 py-0">Retornado</Badge>;
  }
  return null;
}
