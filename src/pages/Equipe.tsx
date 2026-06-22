import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/hooks/use-toast";
import { MoreVertical, Plus, UserX, RotateCcw, Loader2, KeyRound } from "lucide-react";
import { formatPhoneDisplay, normalizePhone, isValidPhone, onlyDigits } from "@/lib/phone";

type Role = "owner" | "admin" | "manager" | "agent" | "financial";
const ROLE_LABEL: Record<Role, string> = {
  owner: "Administrador", admin: "Administrador", manager: "Gerente",
  agent: "Atendente", financial: "Financeiro",
};
const SINGLE_DEPT_ROLES: Role[] = ["agent", "financial"];
const isSingleDeptRole = (r: Role) => SINGLE_DEPT_ROLES.includes(r);

interface Member {
  id: string;
  user_id: string;
  role: Role;
  status: "active" | "pending" | "disabled";
  disabled_reason: string | null;
  profile: {
    id: string; full_name: string | null; email: string | null; phone: string | null;
    signature: string | null; signature_enabled: boolean;
  } | null;
  departments: { department_id: string; participates_in_rotation: boolean }[];
}

interface Dept { id: string; name: string; status: string; assignment_mode?: "manual" | "round_robin" }

export default function Equipe() {
  const { profile } = useAuth();
  const { activeCompanyId, activeMembership } = useCompany();
  const { toast } = useToast();
  const isMaster = profile?.is_master === true || profile?.global_role === "master";
  const callerRole = activeMembership?.role;
  const canManage = isMaster || callerRole === "owner" || callerRole === "admin";

  const [members, setMembers] = useState<Member[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [disabling, setDisabling] = useState<Member | null>(null);
  const [disableReason, setDisableReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState<Member | null>(null);

  const empty = {
    full_name: "", email: "", phone: "",
    role: "agent" as Role,
    department_ids: [] as string[],
    rotation: {} as Record<string, boolean>,
    signature: "", signature_enabled: true,
  };
  const [form, setForm] = useState(empty);

  const load = async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    const [{ data: cu }, { data: d }, { data: du }] = await Promise.all([
      supabase.from("company_users")
        .select("id, user_id, role, status, disabled_reason")
        .eq("company_id", activeCompanyId)
        .neq("status", "pending")
        .order("created_at", { ascending: false }),
      (supabase as any).from("departments")
        .select("id, name, status, assignment_mode")
        .eq("company_id", activeCompanyId)
        .is("deleted_at", null)
        .order("name"),
      (supabase as any).from("department_users")
        .select("user_id, department_id, status, participates_in_rotation")
        .eq("company_id", activeCompanyId)
        .eq("status", "active"),
    ]);

    const ids = (cu ?? []).map((r: any) => r.user_id);
    const { data: profs } = ids.length
      ? await supabase.from("profiles")
          .select("id, full_name, email, phone, signature, signature_enabled")
          .in("id", ids)
      : { data: [] as any[] };

    const list: Member[] = (cu ?? []).map((r: any) => ({
      id: r.id, user_id: r.user_id, role: r.role, status: r.status,
      disabled_reason: r.disabled_reason,
      profile: profs?.find((p: any) => p.id === r.user_id) ?? null,
      departments: (du ?? []).filter((x: any) => x.user_id === r.user_id).map((x: any) => ({ department_id: x.department_id, participates_in_rotation: x.participates_in_rotation !== false })),
    }));

    setMembers(list);
    setDepts(((d ?? []) as Dept[]).filter((x) => x.status === "active"));
    setLoading(false);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [activeCompanyId]);

  const openCreate = () => { setForm(empty); setCreating(true); };
  const openEdit = (m: Member) => {
    setEditing(m);
    setForm({
      full_name: m.profile?.full_name ?? "",
      email: m.profile?.email ?? "",
      phone: m.profile?.phone ?? "",
      role: m.role,
      department_ids: m.departments.map((d) => d.department_id),
      rotation: Object.fromEntries(m.departments.map((d) => [d.department_id, d.participates_in_rotation])),
      signature: m.profile?.signature ?? "",
      signature_enabled: m.profile?.signature_enabled ?? true,
    });
  };

  const toggleDept = (id: string) => {
    setForm((f) => {
      const adding = !f.department_ids.includes(id);
      const rotation = { ...f.rotation };
      if (adding && rotation[id] === undefined) rotation[id] = true;
      if (isSingleDeptRole(f.role)) {
        return { ...f, department_ids: f.department_ids[0] === id ? [] : [id], rotation };
      }
      return {
        ...f,
        department_ids: f.department_ids.includes(id)
          ? f.department_ids.filter((x) => x !== id)
          : [...f.department_ids, id],
        rotation,
      };
    });
  };

  const toggleRotation = (id: string, v: boolean) => {
    setForm((f) => ({ ...f, rotation: { ...f.rotation, [id]: v } }));
  };

  const changeRole = (v: Role) => {
    setForm((f) => ({
      ...f,
      role: v,
      department_ids: isSingleDeptRole(v) ? f.department_ids.slice(0, 1) : f.department_ids,
    }));
  };

  const submitCreate = async () => {
    if (!activeCompanyId) return;
    if (!form.full_name.trim() || !form.email.trim()) {
      return toast({ title: "Nome e e-mail são obrigatórios", variant: "destructive" });
    }
    const emailNorm = form.email.trim().toLowerCase();
    if (members.some((m) => (m.profile?.email ?? "").trim().toLowerCase() === emailNorm)) {
      return toast({ title: "E-mail duplicado", description: "Este e-mail já está cadastrado nesta empresa.", variant: "destructive" });
    }
    if (!isValidPhone(form.phone)) {
      return toast({ title: "WhatsApp inválido", description: "Informe um WhatsApp válido com DDD.", variant: "destructive" });
    }
    if (isSingleDeptRole(form.role) && form.department_ids.length > 1) {
      return toast({ title: "Este cargo permite vínculo com apenas um setor.", variant: "destructive" });
    }
    const safeRole: Role = form.role === "owner" ? "admin" : form.role;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("create-company-user", {
      body: {
        company_id: activeCompanyId,
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: normalizePhone(form.phone),
        role: safeRole,
        department_ids: form.department_ids,
        signature: form.signature.trim() || null,
        signature_enabled: form.signature_enabled,
      },
    });
    setBusy(false);
    const d = data as any;
    if (error || d?.ok === false) {
      const msg = d?.error ?? error?.message ?? "Falha";
      return toast({ title: "Erro ao cadastrar", description: msg, variant: "destructive" });
    }
    toast({
      title: "Atendente cadastrado",
      description: d?.wa_sent
        ? "Senha provisória enviada por WhatsApp."
        : `Cadastro feito. Envio WhatsApp pendente: ${d?.wa_error ?? "indisponível"}`,
    });
    // Apply rotation opt-outs created by create-company-user (defaults to true).
    const optOuts = form.department_ids.filter((dep) => form.rotation[dep] === false);
    if (optOuts.length && d?.user_id) {
      await (supabase as any).from("department_users")
        .update({ participates_in_rotation: false })
        .eq("company_id", activeCompanyId)
        .eq("user_id", d.user_id)
        .in("department_id", optOuts);
    }
    setCreating(false);
    await load();
  };

  const submitEdit = async () => {
    if (!editing || !activeCompanyId) return;
    if (isSingleDeptRole(form.role) && form.department_ids.length > 1) {
      return toast({ title: "Este cargo permite vínculo com apenas um setor.", variant: "destructive" });
    }
    setBusy(true);
    // Update profile basics
    await supabase.from("profiles").update({
      full_name: form.full_name.trim(),
      phone: form.phone ? normalizePhone(form.phone) : null,
      signature: form.signature.trim() || null,
      signature_enabled: form.signature_enabled,
    }).eq("id", editing.user_id);

    // Update role (block lowering own owner role)
    await supabase.from("company_users").update({ role: form.role }).eq("id", editing.id);

    // Replace departments
    await (supabase as any).from("department_users").delete()
      .eq("user_id", editing.user_id).eq("company_id", activeCompanyId);
    if (form.department_ids.length) {
      const rows = form.department_ids.map((dep) => ({
        user_id: editing.user_id, company_id: activeCompanyId, department_id: dep,
        role: form.role === "manager" ? "manager" : "agent", status: "active",
        participates_in_rotation: form.rotation[dep] !== false,
      }));
      await (supabase as any).from("department_users").insert(rows);
    }
    setBusy(false);
    toast({ title: "Atendente atualizado" });
    setEditing(null);
    await load();
  };

  const reactivate = async (m: Member) => {
    if (!activeCompanyId) return;
    const { error } = await supabase.from("company_users").update({
      status: "active", disabled_at: null, disabled_by: null,
      disabled_reason: null, delete_after: null,
    }).eq("id", m.id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Atendente reativado" });
    await load();
  };

  const confirmDisable = async () => {
    if (!disabling) return;
    if (!disableReason.trim()) return toast({ title: "Motivo obrigatório", variant: "destructive" });
    setBusy(true);
    const future = new Date(); future.setDate(future.getDate() + 30);
    const { error } = await supabase.from("company_users").update({
      status: "disabled",
      disabled_at: new Date().toISOString(),
      disabled_by: profile?.id,
      disabled_reason: disableReason.trim(),
      delete_after: future.toISOString(),
    }).eq("id", disabling.id);
    setBusy(false);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Atendente desativado" });
    setDisabling(null); setDisableReason("");
    await load();
  };

  const confirmReset = async () => {
    if (!resetting || !activeCompanyId) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("reset-company-user-password", {
      body: { company_id: activeCompanyId, user_id: resetting.user_id },
    });
    setBusy(false);
    const d = data as any;
    if (error || d?.ok === false) {
      const msg = d?.error ?? error?.message ?? "Falha";
      return toast({ title: "Erro ao redefinir senha", description: msg, variant: "destructive" });
    }
    toast({
      title: "Senha redefinida",
      description: d?.wa_sent
        ? "Nova senha provisória enviada por WhatsApp."
        : `Senha redefinida. Envio WhatsApp pendente: ${d?.wa_error ?? "indisponível"}`,
    });
    setResetting(null);
  };

  const deptMap = useMemo(() => Object.fromEntries(depts.map((d) => [d.id, d.name])), [depts]);

  return (
    <AppLayout title="Equipe">
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Cadastre atendentes, defina cargos e vincule a setores. Senhas provisórias são enviadas por WhatsApp.
          </p>
          {canManage && (
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1.5" /> Novo atendente
            </Button>
          )}
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Setores</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              )}
              {!loading && members.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum usuário cadastrado.</TableCell></TableRow>
              )}
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.profile?.full_name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{m.profile?.email ?? "—"}</TableCell>
                  <TableCell>{ROLE_LABEL[m.role]}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.departments.length === 0 ? "—" : m.departments.map((d) => deptMap[d.department_id] ?? "—").join(", ")}
                  </TableCell>
                  <TableCell>
                    {m.status === "active" ? (
                      <Badge className="bg-success/10 text-success border-success/20">Ativo</Badge>
                    ) : (
                      <Badge className="bg-muted text-muted-foreground border-border">Desativado</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8" disabled={!canManage}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuLabel>Ações</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => openEdit(m)}>Editar</DropdownMenuItem>
                        {m.status === "active" && (
                          <DropdownMenuItem
                            onClick={() => setResetting(m)}
                            disabled={m.user_id === profile?.id}
                          >
                            <KeyRound className="w-3.5 h-3.5 mr-2" /> Redefinir senha
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {m.status === "active" ? (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => { setDisableReason(""); setDisabling(m); }}
                            disabled={m.user_id === profile?.id}
                          >
                            <UserX className="w-3.5 h-3.5 mr-2" /> Desativar
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => reactivate(m)}>
                            <RotateCcw className="w-3.5 h-3.5 mr-2" /> Reativar
                          </DropdownMenuItem>
                        )}
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
      <Dialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar atendente" : "Novo atendente"}</DialogTitle>
            <DialogDescription>
              {editing ? "Atualize dados, cargo e setores." : "O atendente receberá uma senha provisória por WhatsApp."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Nome completo</Label>
                <Input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  disabled={!!editing}
                />
              </div>
              <div className="space-y-1.5">
                <Label>WhatsApp</Label>
                <Input
                  value={formatPhoneDisplay(form.phone)}
                  onChange={(e) => setForm((f) => ({ ...f, phone: onlyDigits(e.target.value) }))}
                  placeholder="+55 11 99999-9999"
                  inputMode="tel"
                />
                {form.phone && !isValidPhone(form.phone) && (
                  <p className="text-xs text-destructive">Informe um WhatsApp válido com DDD.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Cargo</Label>
                <Select value={form.role} onValueChange={(v) => changeRole(v as Role)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="manager">Gerente</SelectItem>
                    <SelectItem value="agent">Atendente</SelectItem>
                    <SelectItem value="financial">Financeiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Setores</Label>
                {isSingleDeptRole(form.role) && (
                  <p className="text-xs text-muted-foreground">Este cargo permite vínculo com apenas um setor.</p>
                )}
                <div className="border rounded-md p-2 max-h-32 overflow-auto space-y-1.5">
                  {depts.length === 0 && (
                    <p className="text-sm text-muted-foreground p-2">Nenhum setor ativo. Crie em /app/setores.</p>
                  )}
                  {depts.map((d) => (
                    <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={form.department_ids.includes(d.id)}
                        onCheckedChange={() => toggleDept(d.id)}
                      />
                      {d.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Assinatura</Label>
                <Textarea
                  value={form.signature}
                  onChange={(e) => setForm((f) => ({ ...f, signature: e.target.value }))}
                  placeholder="Ex.: Maria | Atendimento Rives"
                  rows={2}
                />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <Switch
                  id="sig-en"
                  checked={form.signature_enabled}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, signature_enabled: v }))}
                />
                <Label htmlFor="sig-en" className="cursor-pointer">Usar assinatura nas mensagens</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreating(false); setEditing(null); }}>Cancelar</Button>
            <Button onClick={editing ? submitEdit : submitCreate} disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              {editing ? "Salvar" : "Cadastrar e enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable dialog */}
      <Dialog open={!!disabling} onOpenChange={(o) => !o && setDisabling(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desativar atendente</DialogTitle>
            <DialogDescription>
              {disabling?.profile?.full_name}. O acesso à empresa será bloqueado. Histórico e mensagens são preservados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Motivo da desativação</Label>
            <Textarea
              value={disableReason}
              onChange={(e) => setDisableReason(e.target.value)}
              placeholder="Descreva o motivo..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisabling(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDisable} disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Desativar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password confirmation */}
      <Dialog open={!!resetting} onOpenChange={(o) => !o && setResetting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
            <DialogDescription>
              Deseja redefinir a senha de {resetting?.profile?.full_name ?? "este usuário"}? Uma nova senha provisória
              será enviada por WhatsApp e o usuário será obrigado a trocar a senha no próximo acesso.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetting(null)}>Cancelar</Button>
            <Button onClick={confirmReset} disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Redefinir senha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
