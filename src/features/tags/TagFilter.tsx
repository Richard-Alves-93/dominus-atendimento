import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tag as TagIcon, X, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { tagColorHex } from "@/features/tags/tagColors";

// T.3 — Filtro por etiquetas reaproveitável (Kanban, Tickets, Contatos, Oportunidades).
// Lógica multi-select OR. Respeita company_id (RLS). Sem N+1.

export type TagOption = { id: string; name: string; color: string | null };

export function useCompanyTags(companyId: string | null) {
  return useQuery({
    queryKey: ["company-tags-filter", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags")
        .select("id,name,color")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TagOption[];
    },
    staleTime: 60_000,
  });
}

// Busca em lote os IDs de entidades que possuem alguma das etiquetas selecionadas (lógica OR).
// Retorna null quando nenhum filtro está ativo (= sem filtragem).
export function useEntityIdsByTags(
  companyId: string | null,
  entityType: "contact" | "ticket" | "opportunity",
  tagIds: string[],
) {
  const enabled = !!companyId && tagIds.length > 0;
  const q = useQuery({
    queryKey: ["entity-ids-by-tags", companyId, entityType, [...tagIds].sort().join(",")],
    enabled,
    queryFn: async () => {
      const col = entityType === "contact" ? "contact_id"
        : entityType === "ticket" ? "ticket_id" : "opportunity_id";
      const { data, error } = await supabase
        .from("tag_links")
        .select(`${col}`)
        .eq("company_id", companyId!)
        .eq("entity_type", entityType)
        .in("tag_id", tagIds)
        .is("deleted_at", null);
      if (error) throw error;
      const ids = new Set<string>();
      for (const r of (data ?? []) as Array<Record<string, string | null>>) {
        const v = r[col];
        if (v) ids.add(v);
      }
      return ids;
    },
    staleTime: 15_000,
  });
  return enabled ? q.data ?? null : null;
}

interface Props {
  companyId: string | null;
  selected: string[];
  onChange: (next: string[]) => void;
  className?: string;
  size?: "sm" | "default";
}

export function TagFilter({ companyId, selected, onChange, className, size = "default" }: Props) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const tagsQ = useCompanyTags(companyId);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const filtered = useMemo(() => {
    const list = tagsQ.data ?? [];
    const t = term.trim().toLowerCase();
    return t ? list.filter((x) => x.name.toLowerCase().includes(t)) : list;
  }, [tagsQ.data, term]);

  function toggle(id: string) {
    if (selectedSet.has(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id]);
  }

  const triggerLabel = selected.length === 0
    ? "Etiquetas"
    : `Etiquetas: ${selected.length} selecionada${selected.length > 1 ? "s" : ""}`;

  const heightClass = size === "sm" ? "h-8" : "h-9";

  return (
    <div className={`flex items-center gap-1 ${className ?? ""}`}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={selected.length > 0 ? "default" : "outline"}
            size="sm"
            className={`${heightClass} gap-1`}
            type="button"
          >
            <TagIcon className="h-3.5 w-3.5" />
            <span className="text-xs">{triggerLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-2">
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Buscar etiqueta..."
              className="pl-7 h-8 text-sm"
            />
          </div>
          <div className="max-h-64 overflow-y-auto scrollbar-thin space-y-1">
            {tagsQ.isLoading ? (
              <p className="text-xs text-muted-foreground p-2">Carregando…</p>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2">Nenhuma etiqueta.</p>
            ) : filtered.map((t) => {
              const active = selectedSet.has(t.id);
              const hex = tagColorHex(t.color);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggle(t.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm transition ${
                    active ? "bg-primary/10" : "hover:bg-muted"
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: hex }} />
                  <span className="flex-1 truncate">{t.name}</span>
                  {active && <span className="text-[10px] text-primary font-medium">✓</span>}
                </button>
              );
            })}
          </div>
          {selected.length > 0 && (
            <div className="pt-2 mt-2 border-t flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                {selected.length} selecionada{selected.length > 1 ? "s" : ""}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onChange([])}
              >
                Limpar etiquetas
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Limpar etiquetas"
          onClick={() => onChange([])}
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

export function SelectedTagChips({
  companyId, selected, onChange,
}: { companyId: string | null; selected: string[]; onChange: (next: string[]) => void }) {
  const tagsQ = useCompanyTags(companyId);
  if (selected.length === 0) return null;
  const byId = new Map((tagsQ.data ?? []).map((t) => [t.id, t]));
  return (
    <div className="flex flex-wrap items-center gap-1">
      {selected.map((id) => {
        const t = byId.get(id);
        if (!t) return null;
        const hex = tagColorHex(t.color);
        return (
          <Badge
            key={id}
            variant="outline"
            className="gap-1 pr-1"
            style={{ background: `${hex}1f`, color: hex, borderColor: `${hex}55` }}
          >
            <span className="text-[10px]">{t.name}</span>
            <button
              type="button"
              onClick={() => onChange(selected.filter((x) => x !== id))}
              className="hover:opacity-70"
              aria-label="Remover"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        );
      })}
    </div>
  );
}
