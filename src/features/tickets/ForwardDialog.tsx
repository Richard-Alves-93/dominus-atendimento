import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Search, Forward } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type ForwardTicket = {
  id: string;
  company_id: string;
  status: string;
  last_message_at: string | null;
  protocol_number?: string | null;
  contact: { id: string; name: string | null; phone_number: string | null; avatar_url: string | null } | null;
  department?: { id: string; name: string } | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tickets: ForwardTicket[];
  messageIds: string[];
  currentTicketId: string | null;
  companyId: string | null;
  onSuccess: () => void;
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
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString();
}

export default function ForwardDialog({
  open,
  onOpenChange,
  tickets,
  messageIds,
  currentTicketId,
  companyId,
  onSuccess,
}: Props) {
  const [search, setSearch] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = tickets
      .filter((t) => t.id !== currentTicketId)
      .filter((t) => t.status !== "closed");
    if (!q) return list.slice(0, 100);
    return list
      .filter((t) => {
        const name = (t.contact?.name ?? "").toLowerCase();
        const phone = (t.contact?.phone_number ?? "").toLowerCase();
        const proto = (t.protocol_number ?? "").toLowerCase();
        return name.includes(q) || phone.includes(q) || proto.includes(q);
      })
      .slice(0, 100);
  }, [tickets, search, currentTicketId]);

  const reset = () => {
    setSearch("");
    setTargetId(null);
    setSending(false);
  };

  const handleConfirm = async () => {
    if (!targetId || !companyId || messageIds.length === 0) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("forward-messages", {
        body: {
          company_id: companyId,
          target_ticket_id: targetId,
          message_ids: messageIds,
        },
      });
      if (error) throw error;
      const sent = (data as any)?.sent ?? 0;
      const failed = (data as any)?.failed ?? 0;
      if ((data as any)?.ok === false || failed > 0) {
        toast({
          title: failed > 0 ? `Encaminhamento parcial` : "Falha ao encaminhar",
          description: failed > 0 ? `${sent} enviada(s), ${failed} falha(s)` : "Tente novamente",
          variant: "destructive",
        });
        if (sent === 0) {
          setSending(false);
          return;
        }
      } else {
        toast({ title: "Mensagem encaminhada", description: sent > 1 ? `${sent} mensagens enviadas` : undefined });
      }
      onSuccess();
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Falha ao encaminhar", description: e?.message ?? String(e), variant: "destructive" });
      setSending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-base flex items-center gap-2">
            <Forward className="w-4 h-4" />
            Encaminhar {messageIds.length > 1 ? `${messageIds.length} mensagens` : "mensagem"}
          </DialogTitle>
        </DialogHeader>
        <div className="px-4 pb-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, telefone ou protocolo"
              className="pl-8 h-9"
            />
          </div>
        </div>
        <div className="max-h-[50vh] overflow-y-auto border-t">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhuma conversa encontrada
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((t) => {
                const name = t.contact?.name || t.contact?.phone_number || "Sem nome";
                const sub = [t.contact?.phone_number, t.department?.name].filter(Boolean).join(" • ");
                const isSelected = targetId === t.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setTargetId(t.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/60 ${
                        isSelected ? "bg-primary/10" : ""
                      }`}
                    >
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarImage src={t.contact?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-xs">{initials(t.contact?.name, t.contact?.phone_number)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{name}</span>
                          <span className="text-[11px] text-muted-foreground shrink-0">{fmtTime(t.last_message_at)}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {sub || (t.protocol_number ?? "")}
                        </div>
                      </div>
                      <span
                        className={`h-4 w-4 rounded-full border shrink-0 ${
                          isSelected ? "bg-primary border-primary" : "border-muted-foreground/40"
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <DialogFooter className="px-4 py-3 border-t bg-muted/30">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!targetId || sending} className="gap-2">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Forward className="w-4 h-4" />}
            Encaminhar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
