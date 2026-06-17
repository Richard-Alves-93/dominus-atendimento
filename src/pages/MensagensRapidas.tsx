import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search, Power, Info } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "@/hooks/use-toast";

interface QuickReply {
  id: string;
  title: string;
  shortcut: string | null;
  body: string;
  category: string | null;
  is_active: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

interface FormState {
  id?: string;
  title: string;
  shortcut: string;
  category: string;
  body: string;
  is_active: boolean;
}

const EMPTY_FORM: FormState = {
  title: "",
  shortcut: "",
  category: "",
  body: "",
  is_active: true,
};

const SHORTCUT_RE = /^[a-zA-Z0-9_-]*$/;

function normalizeShortcut(s: string) {
  return s.trim().replace(/\s+/g, "").replace(/^\/+/, "");
}

export default function MensagensRapidas() {
  const { profile } = useAuth();
  const { activeCompanyId } = useCompany();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["quick-replies", "manage", activeCompanyId, profile?.id],
    enabled: !!activeCompanyId && !!profile?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("quick_replies")
        .select("*")
        .eq("company_id", activeCompanyId)
        .eq("user_id", profile!.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as QuickReply[];
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

  const upsert = useMutation({
    mutationFn: async (f: FormState) => {
      if (!activeCompanyId || !profile?.id) throw new Error("Sessão inválida");
      const title = f.title.trim();
      const body = f.body.trim();
      const shortcut = normalizeShortcut(f.shortcut);
      const category = f.category.trim() || null;
      if (!title) throw new Error("Informe um título");
      if (!body) throw new Error("Informe a mensagem");
      if (shortcut && !SHORTCUT_RE.test(shortcut))
        throw new Error("Atalho aceita apenas letras, números, hífen e underscore");

      const payload: Record<string, any> = {
        company_id: activeCompanyId,
        user_id: profile.id,
        title,
        body,
        shortcut: shortcut || null,
        category,
        is_active: f.is_active,
      };
      if (f.id) {
        const { error } = await (supabase as any)
          .from("quick_replies")
          .update(payload)
          .eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("quick_replies")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: "Mensagem rápida salva" });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      qc.invalidateQueries({ queryKey: ["quick-replies"] });
    },
    onError: (e: Error) =>
      toast({ title: "Falha ao salvar", description: e.message, variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: async (row: QuickReply) => {
      const { error } = await (supabase as any)
        .from("quick_replies")
        .update({ is_active: !row.is_active })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quick-replies"] }),
    onError: (e: Error) =>
      toast({ title: "Falha", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("quick_replies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Mensagem rápida excluída" });
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ["quick-replies"] });
    },
    onError: (e: Error) =>
      toast({ title: "Falha", description: e.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };
  const openEdit = (r: QuickReply) => {
    setForm({
      id: r.id,
      title: r.title,
      shortcut: r.shortcut ?? "",
      category: r.category ?? "",
      body: r.body,
      is_active: r.is_active,
    });
    setDialogOpen(true);
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold">Mensagens Rápidas</h1>
            <p className="text-sm text-muted-foreground">
              Atalhos pessoais para inserir mensagens no atendimento.
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> Nova
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por título, atalho, categoria ou conteúdo..."
            className="pl-9"
          />
        </div>

        <div className="rounded-lg border bg-card">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {items.length === 0
                ? "Nenhuma mensagem rápida cadastrada. Clique em Nova para começar."
                : "Nenhum resultado."}
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((r) => (
                <li key={r.id} className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{r.title}</span>
                      {r.shortcut && (
                        <Badge variant="secondary" className="text-[10px]">
                          /{r.shortcut}
                        </Badge>
                      )}
                      {r.category && (
                        <Badge variant="outline" className="text-[10px]">
                          {r.category}
                        </Badge>
                      )}
                      {!r.is_active && (
                        <Badge variant="outline" className="text-[10px]">
                          Inativo
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">
                      {r.body}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => toggleActive.mutate(r)}
                      title={r.is_active ? "Inativar" : "Ativar"}
                    >
                      <Power
                        className={`w-4 h-4 ${r.is_active ? "text-primary" : "text-muted-foreground"}`}
                      />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => openEdit(r)} title="Editar">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeleteId(r.id)}
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px] p-0 gap-0 max-h-[90vh] flex flex-col overflow-hidden rounded-lg">
          <DialogHeader className="px-4 pt-2.5 pb-1.5 border-b space-y-0">
            <DialogTitle className="text-sm font-semibold">
              {form.id ? "Editar mensagem rápida" : "Nova mensagem rápida"}
            </DialogTitle>
            <DialogDescription className="text-[11px] leading-tight">
              Crie atalhos pessoais para acelerar respostas.
            </DialogDescription>
          </DialogHeader>
          <div className="px-4 py-2 space-y-1.5 overflow-y-auto min-h-0">
            <div className="space-y-0.5">
              <Label className="text-xs">Título</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                maxLength={120}
                className="h-8 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-0.5">
                <Label className="text-xs">Atalho (opcional)</Label>
                <Input
                  value={form.shortcut}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, shortcut: normalizeShortcut(e.target.value) }))
                  }
                  placeholder="ex.: saudacao"
                  maxLength={40}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-0.5">
                <Label className="text-xs">Categoria (opcional)</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  maxLength={60}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Mensagem</Label>
                <span
                  className="text-[10px] text-muted-foreground cursor-help underline decoration-dotted"
                  title="Variáveis disponíveis: {{nome_contato}}, {{nome_atendente}}, {{empresa}}, {{data}}, {{hora}}, {{protocolo}}"
                >
                  Ver variáveis
                </span>
              </div>
              <Textarea
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                rows={2}
                maxLength={4000}
                className="resize-none min-h-[56px] text-sm"
              />
            </div>
            <div className="flex items-center justify-between px-1 py-0.5">
              <div className="flex items-center gap-2 leading-tight min-w-0">
                <Label className="text-xs">Ativa</Label>
                <span className="text-[10px] text-muted-foreground truncate">
                  Inativas não aparecem no atendimento.
                </span>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
            </div>
          </div>
          <DialogFooter className="px-4 py-2 border-t bg-background">
            <Button variant="ghost" size="sm" className="h-8 text-sm" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" className="h-8 text-sm" onClick={() => upsert.mutate(form)} disabled={upsert.isPending}>
              {form.id ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir mensagem rápida?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && remove.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
