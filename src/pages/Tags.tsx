import { useMemo, useState } from "react";
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
      toast({ title: "Erro ao excluir etiqueta", description: error.message, variant: "destructive" });
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
  tag, companyId, open, onClose, onSaved,
}: {
  tag: TagRow | null;
  companyId: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(tag?.name ?? "");
  const [color, setColor] = useState(tag?.color ?? "slate");
  const [description, setDescription] = useState(tag?.description ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      toast({ title: "Informe o nome da etiqueta", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (tag) {
        const { error } = await supabase
          .from("tags")
          .update({ name: name.trim(), color, description: description.trim() || null })
          .eq("id", tag.id)
          .eq("company_id", companyId);
        if (error) throw error;
        toast({ title: "Etiqueta atualizada" });
      } else {
        const { error } = await supabase
          .from("tags")
          .insert({ company_id: companyId, name: name.trim(), color, description: description.trim() || null });
        if (error) throw error;
        toast({ title: "Etiqueta criada" });
      }
      onSaved();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({
        title: "Erro ao salvar etiqueta",
        description: /unique|duplicate/i.test(msg) ? "Já existe uma etiqueta com esse nome." : msg,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
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
