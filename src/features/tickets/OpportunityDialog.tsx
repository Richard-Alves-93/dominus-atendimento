import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

export type OpportunityTicketContext = {
  ticket_id: string;
  company_id: string;
  contact_id: string | null;
  contact_name?: string | null;
  department_id: string | null;
  assigned_user_id: string | null;
  channel_type?: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ticket: OpportunityTicketContext | null;
}

const STATUS_LABEL: Record<string, string> = {
  open: "Aberta",
  won: "Ganha",
  lost: "Perdida",
  canceled: "Cancelada",
};

function parseAmount(s: string): number | null {
  if (!s.trim()) return null;
  const normalized = s.replace(/\./g, "").replace(",", ".").replace(/[^\d.\-]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function formatBRL(n: number): string {
  try {
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${n.toFixed(2)}`;
  }
}

export default function OpportunityDialog({ open, onOpenChange, ticket }: Props) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"open" | "won" | "lost" | "canceled">("open");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(ticket?.contact_name ? `Oportunidade — ${ticket.contact_name}` : "Nova oportunidade");
      setAmount("");
      setStatus("open");
      setNotes("");
    }
  }, [open, ticket?.contact_name]);

  const handleSave = async () => {
    if (!ticket || !user) return;
    const t = title.trim();
    if (!t) {
      toast({ title: "Informe um título para a oportunidade.", variant: "destructive" });
      return;
    }
    const amountNum = parseAmount(amount);
    const assignedUserId = ticket.assigned_user_id ?? user.id;
    setSaving(true);
    try {
      const { data: opp, error } = await supabase
        .from("opportunities")
        .insert({
          company_id: ticket.company_id,
          ticket_id: ticket.ticket_id,
          contact_id: ticket.contact_id,
          department_id: ticket.department_id,
          assigned_user_id: assignedUserId,
          created_by: user.id,
          title: t,
          status,
          amount: amountNum,
          currency: "BRL",
          source: ticket.channel_type ?? "ticket",
          notes: notes.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Evento interno no atendimento (R.6/R.7) — best-effort, não bloqueia.
      try {
        const actorName = profile?.full_name ?? profile?.email ?? "Usuário";
        const valueText = amountNum != null ? ` no valor de ${formatBRL(amountNum)}` : "";
        const text = `Oportunidade criada por ${actorName}${valueText}.`;
        await supabase.from("messages").insert({
          company_id: ticket.company_id,
          ticket_id: ticket.ticket_id,
          contact_id: ticket.contact_id,
          channel_id: null,
          direction: "outbound",
          from_me: false,
          msg_type: "system",
          source: "system",
          body: text,
          raw: {
            kind: "opportunity_created",
            opportunity_id: opp?.id ?? null,
            actor_user_id: user.id,
            actor_name: actorName,
            amount: amountNum,
            status,
          },
        } as any);
      } catch {
        /* silencioso */
      }

      // Auditoria — best-effort
      try {
        await supabase.from("audit_logs").insert({
          company_id: ticket.company_id,
          actor_id: user.id,
          action: "opportunity.created",
          entity: "opportunity",
          entity_id: opp?.id ?? null,
          metadata: {
            opportunity_id: opp?.id ?? null,
            ticket_id: ticket.ticket_id,
            contact_id: ticket.contact_id,
            assigned_user_id: assignedUserId,
            status,
            amount: amountNum,
            source: ticket.channel_type ?? "ticket",
          },
        } as any);
      } catch {
        /* silencioso */
      }

      toast({ title: "Oportunidade criada." });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Não foi possível criar a oportunidade.", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Criar oportunidade</DialogTitle>
          <DialogDescription>Registre uma oportunidade ou venda gerada por este atendimento.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="opp-title">Título</Label>
            <Input id="opp-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Plano Pro — João" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="opp-amount">Valor estimado (R$)</Label>
              <Input id="opp-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
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
            <Label htmlFor="opp-notes">Observações</Label>
            <Textarea id="opp-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Detalhes internos sobre a oportunidade" />
          </div>
          <p className="text-xs text-muted-foreground">
            Responsável: {ticket?.assigned_user_id ? "responsável atual do atendimento" : "você (criador)"}.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
