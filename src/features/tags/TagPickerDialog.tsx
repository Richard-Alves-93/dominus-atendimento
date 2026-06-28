import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { TAG_COLOR_PRESETS, tagColorHex } from "@/features/tags/tagColors";
import { formatTagError, formatTagLinkError } from "@/features/tags/formatTagError";

export type TagEntityType = "contact" | "ticket" | "opportunity";

type TagRow = {
  id: string;
  name: string;
  color: string | null;
};

interface Props {
  open: boolean;
  onClose: () => void;
  companyId: string;
  entityType: TagEntityType;
  entityId: string;
  entityLabel?: string;
}

export default function TagPickerDialog({
  open, onClose, companyId, entityType, entityId, entityLabel,
}: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { activeMembership } = useCompany();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("slate");
  const [busy, setBusy] = useState<string | null>(null);

  const role = activeMembership?.role;
  const isMaster = !!profile?.is_master || profile?.global_role === "master";
  const canManageTags = isMaster || role === "owner" || role === "admin" || role === "manager";

  const tagsQ = useQuery({
    queryKey: ["tags", companyId],
    enabled: open && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags")
        .select("id,name,color")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as TagRow[];
    },
  });

  const linksQ = useQuery({
    queryKey: ["tag_links", entityType, entityId],
    enabled: open && !!entityId,
    queryFn: async () => {
      const col = entityType === "contact" ? "contact_id"
        : entityType === "ticket" ? "ticket_id" : "opportunity_id";
      const { data, error } = await supabase
        .from("tag_links")
        .select("id,tag_id")
        .eq("company_id", companyId)
        .eq("entity_type", entityType)
        .eq(col, entityId)
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []) as { id: string; tag_id: string }[];
    },
  });

  const appliedIds = useMemo(() => new Set((linksQ.data ?? []).map((l) => l.tag_id)), [linksQ.data]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const list = tagsQ.data ?? [];
    if (!s) return list;
    return list.filter((t) => t.name.toLowerCase().includes(s));
  }, [tagsQ.data, search]);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["tag_links", entityType, entityId] });
    qc.invalidateQueries({ queryKey: ["entity_tags"] });
  }

  async function toggleTag(tagId: string) {
    setBusy(tagId);
    try {
      const payload: Record<string, unknown> = {
        _company_id: companyId,
        _tag_id: tagId,
        _entity_type: entityType,
        _contact_id: entityType === "contact" ? entityId : null,
        _ticket_id: entityType === "ticket" ? entityId : null,
        _opportunity_id: entityType === "opportunity" ? entityId : null,
      };
      const fn = appliedIds.has(tagId) ? "remove_tag_from_entity" : "apply_tag_to_entity";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)(fn, payload);
      if (error) throw error;
      invalidate();
    } catch (e) {
      toast({ title: "Erro ao atualizar etiqueta", description: formatTagLinkError(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function createTag() {
    if (!newName.trim()) return;
    setBusy("__create");
    try {
      const { error } = await supabase
        .from("tags")
        .insert({ company_id: companyId, name: newName.trim(), color: newColor });
      if (error) throw error;
      setNewName("");
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["tags", companyId] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({
        title: "Erro ao criar etiqueta",
        description: /unique|duplicate/i.test(msg) ? "Já existe uma etiqueta com esse nome." : msg,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Etiquetas</DialogTitle>
          <DialogDescription>
            {entityLabel ? `Aplicar ou remover etiquetas de ${entityLabel}.` : "Aplicar ou remover etiquetas."}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar etiqueta..."
            className="pl-8"
          />
        </div>

        <div className="max-h-72 overflow-y-auto border rounded-md divide-y">
          {tagsQ.isLoading ? (
            <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              Nenhuma etiqueta encontrada.
            </div>
          ) : (
            filtered.map((t) => {
              const active = appliedIds.has(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTag(t.id)}
                  disabled={busy === t.id}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/50 transition ${
                    active ? "bg-muted/30" : ""
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-block h-3 w-3 rounded-full border shrink-0"
                      style={{ background: tagColorHex(t.color) }}
                    />
                    <span className="truncate text-sm">{t.name}</span>
                  </span>
                  {busy === t.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : active ? (
                    <Badge variant="secondary" className="text-[10px]">Aplicada</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">Aplicar</span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {canManageTags && (
          <div className="border-t pt-3">
            {!creating ? (
              <Button variant="ghost" size="sm" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4 mr-1" /> Nova etiqueta
              </Button>
            ) : (
              <div className="space-y-2">
                <Label className="text-xs">Nome</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nome da etiqueta"
                  maxLength={60}
                />
                <div className="flex items-center gap-2 flex-wrap">
                  {TAG_COLOR_PRESETS.map((p) => (
                    <button
                      key={p.v}
                      type="button"
                      onClick={() => setNewColor(p.v)}
                      className={`h-6 w-6 rounded-full border-2 ${
                        newColor === p.v ? "border-foreground" : "border-transparent"
                      }`}
                      style={{ background: p.hex }}
                      aria-label={p.l}
                    />
                  ))}
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => { setCreating(false); setNewName(""); }}>
                    <X className="h-4 w-4" />
                  </Button>
                  <Button size="sm" onClick={createTag} disabled={busy === "__create" || !newName.trim()}>
                    {busy === "__create" && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                    Criar
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
