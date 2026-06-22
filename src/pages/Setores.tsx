import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/hooks/use-toast";
import { DEPARTMENT_STATUS_LABEL } from "@/lib/departments";
import { MoreVertical, Plus, Edit, Pause, Play, Trash2 } from "lucide-react";

interface Department {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  status: "active" | "inactive";
  deleted_at: string | null;
  created_at: string;
  allow_general_queue?: boolean;
  allow_stalled_takeover?: boolean;
  assignment_mode?: "manual" | "round_robin";
}


const badge: Record<string, string> = {
  active: "bg-success/10 text-success border-success/20",
  inactive: "bg-muted text-muted-foreground border-border",
};

export default function Setores() {
  const { profile } = useAuth();
  const { activeCompanyId, activeMembership } = useCompany();
  const { toast } = useToast();
  const isMaster = profile?.is_master === true || profile?.global_role === "master";
  const role = activeMembership?.role;
  const canManage = isMaster || role === "owner" || role === "admin";

  const [list, setList] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Department | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Department | null>(null);
  const [targetId, setTargetId] = useState<string>("");
  const [form, setForm] = useState({ name: "", description: "", status: "active" as "active" | "inactive", allow_general_queue: false, allow_stalled_takeover: false, assignment_mode: "manual" as "manual" | "round_robin" });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from("departments")
      .select("id, company_id, name, description, status, deleted_at, created_at, allow_general_queue, allow_stalled_takeover")
      .eq("company_id", activeCompanyId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    setList((data as Department[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId]);

  const openCreate = () => {
    setForm({ name: "", description: "", status: "active", allow_general_queue: false, allow_stalled_takeover: false });
    setCreating(true);
  };

  const openEdit = (d: Department) => {
    setForm({ name: d.name, description: d.description ?? "", status: d.status, allow_general_queue: !!d.allow_general_queue, allow_stalled_takeover: !!d.allow_stalled_takeover });
    setEditing(d);
  };

  const submit = async () => {
    if (!canManage || !activeCompanyId) return;
    if (!form.name.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    setBusy(true);
    if (editing) {
      const { error } = await (supabase as any)
        .from("departments")
        .update({ name: form.name.trim(), description: form.description.trim() || null, status: form.status, allow_general_queue: form.allow_general_queue, allow_stalled_takeover: form.allow_stalled_takeover })
        .eq("id", editing.id);
      setBusy(false);
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Setor atualizado" });
      setEditing(null);
    } else {
      const { error } = await (supabase as any).from("departments").insert({
        company_id: activeCompanyId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        status: form.status,
        allow_general_queue: form.allow_general_queue,
        allow_stalled_takeover: form.allow_stalled_takeover,
      });
      setBusy(false);
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Setor criado" });
      setCreating(false);
    }
    await load();
  };

  const toggleStatus = async (d: Department) => {
    if (!canManage) return;
    const next = d.status === "active" ? "inactive" : "active";
    const { error } = await (supabase as any).from("departments").update({ status: next }).eq("id", d.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: next === "active" ? "Setor ativado" : "Setor inativado" });
    await load();
  };

  const startDelete = (d: Department) => {
    setTargetId("");
    setDeleting(d);
  };

  const reallocOptions = useMemo(
    () => list.filter((d) => d.status === "active" && deleting && d.id !== deleting.id),
    [list, deleting],
  );

  const confirmDelete = async () => {
    if (!canManage || !deleting || !activeCompanyId) return;
    setBusy(true);
    // Check if any users or open tickets are linked
    const [{ count: usersCount }, { count: ticketsCount }] = await Promise.all([
      (supabase as any)
        .from("department_users")
        .select("id", { count: "exact", head: true })
        .eq("department_id", deleting.id),
      (supabase as any)
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("department_id", deleting.id)
        .neq("status", "closed"),
    ]);

    const hasLinks = (usersCount ?? 0) > 0 || (ticketsCount ?? 0) > 0;

    if (hasLinks) {
      if (!targetId) {
        setBusy(false);
        toast({
          title: "Setor de destino obrigatório",
          description: "Escolha para qual setor mover usuários e atendimentos antes de excluir.",
          variant: "destructive",
        });
        return;
      }
      // Move users
      if ((usersCount ?? 0) > 0) {
        const { error: e1 } = await (supabase as any)
          .from("department_users")
          .update({ department_id: targetId })
          .eq("department_id", deleting.id);
        if (e1) {
          setBusy(false);
          toast({ title: "Erro ao mover usuários", description: e1.message, variant: "destructive" });
          return;
        }
      }
      // Move open tickets
      if ((ticketsCount ?? 0) > 0) {
        const { error: e2 } = await (supabase as any)
          .from("tickets")
          .update({ department_id: targetId })
          .eq("department_id", deleting.id)
          .neq("status", "closed");
        if (e2) {
          setBusy(false);
          toast({ title: "Erro ao mover atendimentos", description: e2.message, variant: "destructive" });
          return;
        }
      }
    }

    // Soft delete
    const { error } = await (supabase as any)
      .from("departments")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: profile?.id,
        status: "inactive",
      })
      .eq("id", deleting.id);
    setBusy(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Setor excluído" });
    setDeleting(null);
    await load();
  };

  return (
    <AppLayout title="Setores">
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Organize seu atendimento por áreas como Vendas, Suporte, Financeiro e mais.
            </p>
          </div>
          {canManage && (
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1.5" /> Novo setor
            </Button>
          )}
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              )}
              {!loading && list.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Nenhum setor cadastrado.
                  </TableCell>
                </TableRow>
              )}
              {list.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell className="text-muted-foreground">{d.description ?? "—"}</TableCell>
                  <TableCell>
                    <Badge className={badge[d.status]}>{DEPARTMENT_STATUS_LABEL[d.status]}</Badge>
                  </TableCell>
                  <TableCell>{new Date(d.created_at).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8" disabled={!canManage}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuLabel>Ações</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => openEdit(d)}>
                          <Edit className="w-3.5 h-3.5 mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleStatus(d)}>
                          {d.status === "active" ? (
                            <>
                              <Pause className="w-3.5 h-3.5 mr-2" /> Inativar
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5 mr-2" /> Ativar
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => startDelete(d)}
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Create / Edit dialog */}
      <Dialog
        open={creating || !!editing}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar setor" : "Novo setor"}</DialogTitle>
            <DialogDescription>Defina o nome, a descrição e o status do setor.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex.: Vendas"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desc">Descrição</Label>
              <Textarea
                id="desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Descrição opcional"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as any }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="allow_gq" className="text-sm">Participa da Fila geral</Label>
                <p className="text-xs text-muted-foreground">
                  Permite que usuários deste setor visualizem e aceitem atendimentos sem responsável.
                </p>
              </div>
              <Switch
                id="allow_gq"
                checked={form.allow_general_queue}
                onCheckedChange={(v) => setForm((f) => ({ ...f, allow_general_queue: !!v }))}
              />
            </div>
            <div className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="allow_st" className="text-sm">Pode assumir atendimento parado</Label>
                <p className="text-xs text-muted-foreground">
                  Permite que usuários deste setor assumam atendimentos parados conforme o tempo configurado.
                </p>
              </div>
              <Switch
                id="allow_st"
                checked={form.allow_stalled_takeover}
                onCheckedChange={(v) => setForm((f) => ({ ...f, allow_stalled_takeover: !!v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
            >
              Cancelar
            </Button>
            <Button onClick={submit} disabled={busy}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog with reallocation */}
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir setor</DialogTitle>
            <DialogDescription>
              {deleting?.name}. Se houver usuários ou atendimentos vinculados, escolha o setor de destino para
              realocação antes da exclusão.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Setor de destino (opcional se não houver vínculos)</Label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um setor ativo" />
                </SelectTrigger>
                <SelectContent>
                  {reallocOptions.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      Nenhum outro setor ativo disponível.
                    </div>
                  )}
                  {reallocOptions.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={busy}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
