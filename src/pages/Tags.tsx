import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Loader2, Pencil, Trash2, Search, Tag as TagIcon } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TAG_COLOR_PRESETS, tagColorHex } from "@/features/tags/tagColors";
import { formatTagError } from "@/features/tags/formatTagError";

type TagRow = {
  id: string;
  company_id: string;
  name: string;
  color: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
};

export default function Tags() {
  const { activeCompanyId, activeMembership } = useCompany();
  const { profile } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<TagRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<TagRow | null>(null);

  const role = activeMembership?.role;
  const isMaster = !!profile?.is_master || profile?.global_role === "master";
  const canManage = isMaster || role === "owner" || role === "admin" || role === "manager";

  const tagsQ = useQuery({
    queryKey: ["tags", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags")
        .select("id,company_id,name,color,description,is_active,created_at")
        .eq("company_id", activeCompanyId!)
        .is("deleted_at", null)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TagRow[];
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return tagsQ.data ?? [];
    return (tagsQ.data ?? []).filter((t) => t.name.toLowerCase().includes(s));
  }, [tagsQ.data, search]);

  async function handleDelete() {
    if (!toDelete || !activeCompanyId) return;
    const { error } = await supabase
      .from("tags")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", toDelete.id)
      .eq("company_id", activeCompanyId);
    if (error) {
      toast({ title: "Erro ao excluir etiqueta", description: formatTagError(error), variant: "destructive" });
    } else {
      toast({ title: "Etiqueta excluída" });
      qc.invalidateQueries({ queryKey: ["tags"] });
    }
    setToDelete(null);
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-5xl">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <TagIcon className="h-5 w-5" /> Etiquetas
            </h1>
            <p className="text-sm text-muted-foreground">
              Classifique contatos, atendimentos e oportunidades.
            </p>
          </div>
          {canManage && (
            <Button onClick={() => setCreating(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Nova etiqueta
            </Button>
          )}
        </div>

        <div className="relative max-w-sm">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar etiqueta..."
            className="pl-8"
          />
        </div>

        <Card className="divide-y">
          {tagsQ.isLoading ? (
            <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma etiqueta encontrada.
            </div>
          ) : (
            filtered.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="inline-block h-3.5 w-3.5 rounded-full border"
                    style={{ background: tagColorHex(t.color) }}
                  />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{t.name}</div>
                    {t.description && (
                      <div className="text-xs text-muted-foreground truncate">{t.description}</div>
                    )}
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(t)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setToDelete(t)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </Card>
      </div>

      {(creating || editing) && (
        <TagDialog
          tag={editing}
          companyId={activeCompanyId!}
          canManage={canManage}
          open
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => qc.invalidateQueries({ queryKey: ["tags"] })}
        />
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir etiqueta?</AlertDialogTitle>
            <AlertDialogDescription>
              A etiqueta "{toDelete?.name}" será arquivada. Os vínculos atuais permanecem no histórico,
              mas a etiqueta não estará mais disponível para novas aplicações.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

function TagDialog({
  tag, companyId, canManage, open, onClose, onSaved,
}: {
  tag: TagRow | null;
  companyId: string;
  canManage: boolean;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(tag?.name ?? "");
  const [color, setColor] = useState(tag?.color ?? "slate");
  const [description, setDescription] = useState(tag?.description ?? "");
  const [saving, setSaving] = useState(false);

  // Automation state
  const [automationId, setAutomationId] = useState<string | null>(null);
  const [autoActive, setAutoActive] = useState(false);
  const [autoLaneId, setAutoLaneId] = useState<string>("");
  const [autoColumnId, setAutoColumnId] = useState<string>("");
  const [lanes, setLanes] = useState<Array<{ id: string; name: string }>>([]);
  const [columns, setColumns] = useState<Array<{ id: string; lane_id: string; name: string }>>([]);

  // Load lanes/columns + existing automation on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!canManage) return;
      const [lanesRes, colsRes] = await Promise.all([
        supabase
          .from("kanban_lanes")
          .select("id,name,position")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .order("position", { ascending: true }),
        supabase
          .from("kanban_columns")
          .select("id,lane_id,name,position")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .order("position", { ascending: true }),
      ]);
      if (cancelled) return;
      setLanes((lanesRes.data ?? []) as any);
      setColumns((colsRes.data ?? []) as any);

      if (tag) {
        const { data: aut } = await (supabase as any)
          .from("tag_automations")
          .select("id,is_active,target_kanban_lane_id,target_kanban_column_id")
          .eq("company_id", companyId)
          .eq("tag_id", tag.id)
          .eq("action_type", "move_kanban_card")
          .is("deleted_at", null)
          .maybeSingle();
        if (cancelled) return;
        if (aut) {
          setAutomationId(aut.id);
          setAutoActive(!!aut.is_active);
          setAutoLaneId(aut.target_kanban_lane_id ?? "");
          setAutoColumnId(aut.target_kanban_column_id ?? "");
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const colsForLane = columns.filter((c) => !autoLaneId || c.lane_id === autoLaneId);

  async function save() {
    if (!name.trim()) {
      toast({ title: "Informe o nome da etiqueta", variant: "destructive" });
      return;
    }
    if (canManage && autoActive) {
      if (!autoLaneId || !autoColumnId) {
        toast({ title: "Selecione a linha e a coluna alvo da automação", variant: "destructive" });
        return;
      }
    }
    setSaving(true);
    try {
      let tagId = tag?.id ?? null;
      if (tag) {
        const { error } = await supabase
          .from("tags")
          .update({ name: name.trim(), color, description: description.trim() || null })
          .eq("id", tag.id)
          .eq("company_id", companyId);
        if (error) throw error;
      } else {
        const { data: created, error } = await supabase
          .from("tags")
          .insert({ company_id: companyId, name: name.trim(), color, description: description.trim() || null })
          .select("id")
          .single();
        if (error) throw error;
        tagId = created!.id;
      }

      // Save automation
      if (canManage && tagId) {
        if (automationId) {
          if (autoActive) {
            const { error } = await (supabase as any)
              .from("tag_automations")
              .update({
                is_active: true,
                target_kanban_lane_id: autoLaneId,
                target_kanban_column_id: autoColumnId,
              })
              .eq("id", automationId)
              .eq("company_id", companyId);
            if (error) throw error;
          } else {
            // soft-delete / deactivate
            const { error } = await (supabase as any)
              .from("tag_automations")
              .update({ is_active: false, deleted_at: new Date().toISOString() })
              .eq("id", automationId)
              .eq("company_id", companyId);
            if (error) throw error;
            setAutomationId(null);
          }
        } else if (autoActive) {
          const { error } = await (supabase as any)
            .from("tag_automations")
            .insert({
              company_id: companyId,
              tag_id: tagId,
              event_type: "tag_applied",
              entity_type: "ticket",
              action_type: "move_kanban_card",
              target_kanban_lane_id: autoLaneId,
              target_kanban_column_id: autoColumnId,
              is_active: true,
            });
          if (error) throw error;
        }
      }

      toast({ title: tag ? "Etiqueta atualizada" : "Etiqueta criada" });
      onSaved();
      onClose();
    } catch (e) {
      toast({
        title: "Erro ao salvar etiqueta",
        description: formatTagError(e),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tag ? "Editar etiqueta" : "Nova etiqueta"}</DialogTitle>
          <DialogDescription>Defina nome, cor e descrição.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </div>
          <div>
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-2 pt-1">
              {TAG_COLOR_PRESETS.map((p) => (
                <button
                  key={p.v}
                  type="button"
                  onClick={() => setColor(p.v)}
                  className={`h-7 w-7 rounded-full border-2 transition ${
                    color === p.v ? "border-foreground" : "border-transparent"
                  }`}
                  style={{ background: p.hex }}
                  aria-label={p.l}
                  title={p.l}
                />
              ))}
            </div>
          </div>
          <div>
            <Label>Descrição (opcional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={240}
            />
          </div>

          {canManage && (
            <div className="rounded-md border p-3 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Automação</div>
                  <div className="text-xs text-muted-foreground">
                    Ao aplicar esta etiqueta em um atendimento, mover o card no Kanban.
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={autoActive}
                    onChange={(e) => setAutoActive(e.target.checked)}
                  />
                  Ativar
                </label>
              </div>
              {autoActive && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Linha</Label>
                    <select
                      className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                      value={autoLaneId}
                      onChange={(e) => {
                        setAutoLaneId(e.target.value);
                        setAutoColumnId("");
                      }}
                    >
                      <option value="">Selecione...</option>
                      {lanes.map((l) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Coluna alvo</Label>
                    <select
                      className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                      value={autoColumnId}
                      onChange={(e) => setAutoColumnId(e.target.value)}
                      disabled={!autoLaneId}
                    >
                      <option value="">Selecione...</option>
                      {colsForLane.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Esta automação move apenas o card do atendimento no Kanban. Ela não transfere o setor
                e não envia mensagens.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Small helper to run an async loader once on mount without an extra import.
function useStateLoader(fn: () => Promise<void> | void) {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [, set] = useState(false);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useMemo(() => {
    Promise.resolve(fn()).finally(() => set(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
