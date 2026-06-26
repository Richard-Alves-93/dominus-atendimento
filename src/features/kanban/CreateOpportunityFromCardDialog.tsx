import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

type CardCtx = {
  id: string;
  card_type: string;
  title: string;
  contact_id: string | null;
  ticket_id: string | null;
};

type Lane = { id: string; name: string; company_id: string; lane_type: string; is_active?: boolean };
type Column = { id: string; name: string; lane_id: string; company_id: string };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  card: CardCtx | null;
  companyId: string | null;
  currentUserId: string | null;
  lanes: Lane[];
  columns: Column[];
  onCreated?: (newCardId: string | null) => void;
}

const STATUS_LABEL: Record<string, string> = {
  open: "Aberta",
  won: "Ganha",
  lost: "Perdida",
  canceled: "Cancelada",
};

function parseAmount(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s.replace(/\./g, "").replace(",", ".").replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export default function CreateOpportunityFromCardDialog({
  open, onOpenChange, card, companyId, currentUserId, lanes, columns, onCreated,
}: Props) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"open" | "won" | "lost" | "canceled">("open");
  const [notes, setNotes] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [laneId, setLaneId] = useState<string>("__none__");
  const [columnId, setColumnId] = useState<string>("");
  const [members, setMembers] = useState<Array<{ user_id: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !companyId) return;
    setTitle(card?.title ? `Oportunidade — ${card.title}` : "Nova oportunidade");
    setAmount("");
    setStatus("open");
    setNotes("");
    setLaneId("__none__");
    setColumnId("");
    setAssigneeId(currentUserId ?? "");
    (async () => {
      const { data } = await (supabase as any)
        .from("company_users")
        .select("user_id, status, profiles:profiles!company_users_user_id_fkey(full_name,email)")
        .eq("company_id", companyId)
        .eq("status", "active");
      const list = (data ?? []).map((r: any) => ({
        user_id: r.user_id,
        name: r.profiles?.full_name || r.profiles?.email || "Usuário",
      }));
      setMembers(list);
    })();
  }, [open, companyId, card?.title, currentUserId]);

  const availableColumns = useMemo(
    () => columns.filter((c) => c.lane_id === laneId),
    [columns, laneId],
  );

  const handleSave = async () => {
    if (!card || !companyId || !currentUserId) return;
    const t = title.trim();
    if (!t) {
      toast({ title: "Informe um título.", variant: "destructive" });
      return;
    }
    const amt = parseAmount(amount);
    const useLane = laneId !== "__none__" ? laneId : null;
    const useCol = useLane ? (columnId || null) : null;
    if (useLane && !useCol) {
      toast({ title: "Selecione a coluna de destino.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("create_opportunity_from_kanban", {
        _company_id: companyId,
        _kanban_card_id: card.id,
        _title: t,
        _amount: amt,
        _assigned_user_id: assigneeId || null,
        _status: status,
        _notes: notes.trim() || null,
        _target_lane_id: useLane,
        _target_column_id: useCol,
      });
      if (error) {
        const msg = error.message || "";
        if (msg.includes("duplicate_open_opportunity_for_ticket")) {
          toast({
            title: "Já existe uma oportunidade aberta para este atendimento.",
            variant: "destructive",
          });
        } else {
          toast({ title: "Não foi possível criar a oportunidade", description: msg, variant: "destructive" });
        }
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      toast({ title: "Oportunidade criada." });
      onCreated?.(row?.new_card_id ?? null);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Criar oportunidade</DialogTitle>
          <DialogDescription>
            {card?.card_type === "ticket"
              ? "Vincula a oportunidade a este atendimento."
              : "Vincula a oportunidade a este contato."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor estimado (R$)</Label>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label>Status inicial</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABEL).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Linha (opcional)</Label>
              <Select value={laneId} onValueChange={(v) => { setLaneId(v); setColumnId(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Não criar card</SelectItem>
                  {lanes.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Coluna</Label>
              <Select
                value={columnId}
                onValueChange={setColumnId}
                disabled={laneId === "__none__" || availableColumns.length === 0}
              >
                <SelectTrigger><SelectValue placeholder={laneId === "__none__" ? "—" : "Selecione"} /></SelectTrigger>
                <SelectContent>
                  {availableColumns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            A criação não dispara comissão automaticamente. Ações comerciais só são aplicadas ao mover o card depois.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Criar oportunidade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
