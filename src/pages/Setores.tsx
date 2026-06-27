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
  const [kanbanSetup, setKanbanSetup] = useState<{ open: boolean; departmentId?: string; departmentName?: string }>({ open: false });

  const load = async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from("departments")
      .select("id, company_id, name, description, status, deleted_at, created_at, allow_general_queue, allow_stalled_takeover, assignment_mode")
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
    setForm({ name: "", description: "", status: "active", allow_general_queue: false, allow_stalled_takeover: false, assignment_mode: "manual" });
    setCreating(true);
  };

  const openEdit = (d: Department) => {
    setForm({ name: d.name, description: d.description ?? "", status: d.status, allow_general_queue: !!d.allow_general_queue, allow_stalled_takeover: !!d.allow_stalled_takeover, assignment_mode: (d.assignment_mode ?? "manual") });
    setEditing(d);
  };

  const writeAudit = async (event_type: string, department_id: string, metadata: Record<string, any>) => {
    try {
      await (supabase as any).from("audit_logs").insert({
        company_id: activeCompanyId,
        event_type,
        changed_by: profile?.id ?? null,
        metadata: { department_id, ...metadata },
      });
    } catch {
      // auditoria não deve quebrar fluxo principal
    }
  };

  const submit = async () => {
    if (!canManage || !activeCompanyId) return;
    if (!form.name.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    setBusy(true);
    if (editing) {
      const prev = {
        name: editing.name,
        status: editing.status,
        assignment_mode: editing.assignment_mode ?? "manual",
      };
      const next = {
        name: form.name.trim(),
        status: form.status,
        assignment_mode: form.assignment_mode,
      };
      const { error } = await (supabase as any)
        .from("departments")
        .update({ name: next.name, description: form.description.trim() || null, status: next.status, allow_general_queue: form.allow_general_queue, allow_stalled_takeover: form.allow_stalled_takeover, assignment_mode: next.assignment_mode })
        .eq("id", editing.id);
      setBusy(false);
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        return;
      }
      if (prev.assignment_mode !== next.assignment_mode) {
        await writeAudit("department.assignment_mode_changed", editing.id, {
          department_name: next.name,
          old_assignment_mode: prev.assignment_mode,
          new_assignment_mode: next.assignment_mode,
        });
      }
      const changed: Record<string, { from: any; to: any }> = {};
      if (prev.name !== next.name) changed.name = { from: prev.name, to: next.name };
      if (prev.status !== next.status) changed.status = { from: prev.status, to: next.status };
      if (Object.keys(changed).length > 0) {
        await writeAudit("department.updated", editing.id, {
          department_name: next.name,
          changes: changed,
        });
      }
      toast({ title: "Setor atualizado" });
      setEditing(null);
    } else {
      const { data: created, error } = await (supabase as any).from("departments").insert({
        company_id: activeCompanyId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        status: form.status,
        allow_general_queue: form.allow_general_queue,
        allow_stalled_takeover: form.allow_stalled_takeover,
        assignment_mode: form.assignment_mode,
      }).select("id").single();
      setBusy(false);
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        return;
      }
      if (created?.id) {
        await writeAudit("department.created", created.id, {
          department_name: form.name.trim(),
          assignment_mode: form.assignment_mode,
          status: form.status,
        });
        setKanbanSetup({ open: true, departmentId: created.id, departmentName: form.name.trim() });
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
            <div className="space-y-1.5 rounded-md border p-3">
              <Label className="text-sm">Distribuição de atendimentos</Label>
              <Select
                value={form.assignment_mode}
                onValueChange={(v) => setForm((f) => ({ ...f, assignment_mode: v as "manual" | "round_robin" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="round_robin">Rotativo entre atendentes</SelectItem>
                </SelectContent>
              </Select>
              {form.assignment_mode === "round_robin" ? (
                <p className="text-xs text-muted-foreground">
                  Todos os usuários ativos vinculados a este setor participarão do rodízio automático de atendimentos. A aplicação real da distribuição será ativada em uma etapa posterior.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Os atendimentos ficarão na fila do setor e deverão ser assumidos manualmente.
                </p>
              )}
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

      <KanbanSetupDialog
        open={kanbanSetup.open}
        departmentId={kanbanSetup.departmentId}
        departmentName={kanbanSetup.departmentName}
        companyId={activeCompanyId ?? null}
        userId={profile?.id ?? null}
        onClose={() => setKanbanSetup({ open: false })}
      />
    </AppLayout>
  );
}

const KANBAN_TEMPLATES: Record<string, { label: string; columns: string[] }> = {
  blank: { label: "Criar em branco", columns: [] },
  atendimento: { label: "Modelo Atendimento", columns: ["Novo", "Em atendimento", "Aguardando cliente", "Encaminhar", "Resolvido"] },
  comercial: { label: "Modelo Comercial", columns: ["Novo lead", "Em atendimento", "Proposta enviada", "Negociação", "Ganha", "Perdida"] },
  suporte: { label: "Modelo Suporte", columns: ["Novo chamado", "Em análise", "Aguardando cliente", "Em solução", "Resolvido"] },
};

function KanbanSetupDialog({
  open, departmentId, departmentName, companyId, userId, onClose,
}: {
  open: boolean;
  departmentId?: string;
  departmentName?: string;
  companyId: string | null;
  userId: string | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const writeAudit = async (event_type: string, metadata: Record<string, any>) => {
    try {
      await (supabase as any).from("audit_logs").insert({
        company_id: companyId,
        event_type,
        changed_by: userId,
        metadata: { source: "departments_kanban_setup", department_id: departmentId, ...metadata },
      });
    } catch {}
  };

  const apply = async (templateKey: keyof typeof KANBAN_TEMPLATES | "later") => {
    if (!companyId || !departmentId) return;
    if (templateKey === "later") {
      onClose();
      return;
    }
    setBusy(true);
    try {
      // Duplicate check
      const { data: existing } = await (supabase as any)
        .from("kanban_lanes")
        .select("id")
        .eq("company_id", companyId)
        .eq("department_id", departmentId)
        .eq("lane_type", "department")
        .is("deleted_at", null)
        .maybeSingle();
      if (existing?.id) {
        toast({ title: "Este setor já possui uma linha no Kanban.", variant: "destructive" });
        setBusy(false);
        onClose();
        return;
      }
      // Determine next position
      const { data: lastPos } = await (supabase as any)
        .from("kanban_lanes")
        .select("position")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("position", { ascending: false })
        .limit(1);
      const nextPos = ((lastPos?.[0]?.position as number) ?? -1) + 1;

      const { data: lane, error: laneErr } = await (supabase as any)
        .from("kanban_lanes")
        .insert({
          company_id: companyId,
          name: departmentName,
          lane_type: "department",
          department_id: departmentId,
          is_personal: false,
          owner_user_id: null,
          is_active: true,
          position: nextPos,
          created_by: userId,
        })
        .select("id")
        .single();
      if (laneErr) throw laneErr;

      await writeAudit("kanban.department_lane_created", { lane_id: lane.id, template: templateKey });

      const cols = KANBAN_TEMPLATES[templateKey].columns;
      if (cols.length > 0) {
        const payload = cols.map((name, i) => ({
          company_id: companyId,
          lane_id: lane.id,
          name,
          position: i,
        }));
        const { error: colErr } = await (supabase as any).from("kanban_columns").insert(payload);
        if (colErr) throw colErr;
        await writeAudit("kanban.department_lane_template_applied", {
          lane_id: lane.id,
          template: templateKey,
          columns: cols,
        });
      }

      toast({ title: "Kanban configurado", description: `Linha do setor "${departmentName}" criada.` });
      onClose();
    } catch (e: any) {
      toast({ title: "Erro ao configurar Kanban", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deseja configurar o Kanban deste setor?</DialogTitle>
          <DialogDescription>
            Você pode criar uma linha no Kanban para organizar os atendimentos deste setor. Escolha um modelo pronto ou comece em branco.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button variant="outline" disabled={busy} onClick={() => apply("blank")}>Criar em branco</Button>
          <Button variant="outline" disabled={busy} onClick={() => apply("atendimento")}>Modelo Atendimento</Button>
          <Button variant="outline" disabled={busy} onClick={() => apply("comercial")}>Modelo Comercial</Button>
          <Button variant="outline" disabled={busy} onClick={() => apply("suporte")}>Modelo Suporte</Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => apply("later")}>Configurar depois</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
