import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { MessageSquareText, Search, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { applyMessageVariables } from "@/lib/messageVariables";

export interface QuickReplyRow {
  id: string;
  title: string;
  shortcut: string | null;
  body: string;
  category: string | null;
  is_active: boolean;
  usage_count: number;
}

interface Props {
  disabled?: boolean;
  contactName?: string | null;
  protocol?: string | null;
  onInsert: (text: string) => void;
}

export function QuickRepliesPopover({ disabled, contactName, protocol, onInsert }: Props) {
  const { profile } = useAuth();
  const { activeCompanyId, activeMembership } = useCompany();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const { data: items = [] } = useQuery({
    queryKey: ["quick-replies", "active", activeCompanyId, profile?.id],
    enabled: open && !!activeCompanyId && !!profile?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("quick_replies")
        .select("id, title, shortcut, body, category, is_active, usage_count")
        .eq("company_id", activeCompanyId)
        .eq("user_id", profile!.id)
        .eq("is_active", true)
        .order("title", { ascending: true });
      if (error) throw error;
      return (data ?? []) as QuickReplyRow[];
    },
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (i) =>
        i.title.toLowerCase().includes(s) ||
        (i.shortcut ?? "").toLowerCase().includes(s) ||
        (i.category ?? "").toLowerCase().includes(s) ||
        i.body.toLowerCase().includes(s),
    );
  }, [items, q]);

  const bump = useMutation({
    mutationFn: async (id: string) => {
      const cur = items.find((i) => i.id === id);
      await (supabase as any)
        .from("quick_replies")
        .update({ usage_count: (cur?.usage_count ?? 0) + 1 })
        .eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quick-replies"] }),
  });

  const agentName =
    profile?.public_name?.trim() ||
    profile?.signature?.trim() ||
    profile?.full_name ||
    "";
  const companyName = activeMembership?.company?.name ?? "";

  const handlePick = (item: QuickReplyRow) => {
    const rendered = applyMessageVariables(item.body, {
      contactName,
      agentName,
      companyName,
      protocol,
    });
    onInsert(rendered);
    setOpen(false);
    bump.mutate(item.id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          className="h-10 w-10 rounded-full flex-shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Mensagens rápidas"
          title="Mensagens rápidas"
        >
          <MessageSquareText className="w-5 h-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80 p-0">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar mensagem rápida..."
              className="h-9 pl-8"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              {items.length === 0
                ? "Nenhuma mensagem rápida cadastrada."
                : "Nenhum resultado."}
            </div>
          ) : (
            filtered.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => handlePick(i)}
                className="w-full text-left px-3 py-2 hover:bg-muted/60 focus:bg-muted/60 focus:outline-none"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{i.title}</span>
                  {i.shortcut && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      /{i.shortcut}
                    </Badge>
                  )}
                  {i.category && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {i.category}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                  {i.body}
                </div>
              </button>
            ))
          )}
        </div>
        <div className="border-t p-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="w-full justify-start text-xs text-muted-foreground"
            onClick={() => setOpen(false)}
          >
            <Link to="/app/mensagens-rapidas">
              <Settings2 className="w-3.5 h-3.5 mr-2" />
              Gerenciar mensagens rápidas
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
