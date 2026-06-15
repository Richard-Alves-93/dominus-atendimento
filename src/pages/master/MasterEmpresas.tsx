import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MasterLayout } from "@/components/MasterLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  DialogHeader,
  DialogTitle,
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
import { useToast } from "@/hooks/use-toast";
import { Eye, LogIn, MoreVertical, Pause, Play } from "lucide-react";

interface Company {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  created_at: string;
  is_internal: boolean;
}

const badge: Record<string, string> = {
  trial: "bg-info/10 text-info border-info/20",
  active: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  suspended: "bg-destructive/10 text-destructive border-destructive/20",
  canceled: "bg-muted text-muted-foreground border-border",
};

const SUSPENDABLE = new Set(["active", "trial", "pending"]);
const REACTIVATABLE = new Set(["suspended", "canceled"]);

export default function MasterEmpresas() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [detailsCompany, setDetailsCompany] = useState<Company | null>(null);
  const [suspendCompany, setSuspendCompany] = useState<Company | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { startImpersonation } = useCompany();
  const { toast } = useToast();
  const isMaster = profile?.is_master === true || profile?.global_role === "master";

  const load = () =>
    (supabase
      .from("companies")
      .select("id, name, email, phone, status, created_at, is_internal") as any)
      .order("created_at", { ascending: false })
      .then(({ data }: { data: Company[] | null }) => setCompanies(data ?? []));

  useEffect(() => {
    void load();
  }, []);

  const enterCompany = (c: Company) => {
    if (!isMaster) return;
    startImpersonation(c.id, c.name);
    navigate("/app/dashboard");
  };

  const changeStatus = async (c: Company, status: "suspended" | "active") => {
    if (!isMaster) return;
    if (c.is_internal && status === "suspended") {
      toast({
        title: "Ação bloqueada",
        description: "A empresa interna Dominus não pode ser suspensa.",
        variant: "destructive",
      });
      return;
    }
    setBusyId(c.id);
    const { error } = await supabase.from("companies").update({ status }).eq("id", c.id);
    setBusyId(null);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: status === "suspended" ? "Empresa suspensa" : "Empresa reativada",
      description: c.name,
    });
    await load();
  };

  return (
    <MasterLayout title="Empresas">
      <div className="p-6">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criada em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhuma empresa cadastrada ainda.
                  </TableCell>
                </TableRow>
              )}
              {companies.map((c) => {
                const canSuspend = SUSPENDABLE.has(c.status);
                const canReactivate = REACTIVATABLE.has(c.status);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.email ?? "—"}</TableCell>
                    <TableCell>{c.phone ?? "—"}</TableCell>
                    <TableCell><Badge className={badge[c.status]}>{c.status}</Badge></TableCell>
                    <TableCell>{new Date(c.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={!isMaster || busyId === c.id}>
                            <MoreVertical className="w-4 h-4" />
                            <span className="sr-only">Abrir menu de ações</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuLabel>Ações</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => enterCompany(c)} disabled={!isMaster}>
                            <LogIn className="w-3.5 h-3.5 mr-2" /> Entrar como empresa
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDetailsCompany(c)}>
                            <Eye className="w-3.5 h-3.5 mr-2" /> Ver detalhes
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {canSuspend && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setSuspendCompany(c)}
                              disabled={!isMaster}
                            >
                              <Pause className="w-3.5 h-3.5 mr-2" /> Suspender empresa
                            </DropdownMenuItem>
                          )}
                          {canReactivate && (
                            <DropdownMenuItem
                              onClick={() => changeStatus(c, "active")}
                              disabled={!isMaster}
                            >
                              <Play className="w-3.5 h-3.5 mr-2" /> Reativar empresa
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>

      <Dialog open={!!detailsCompany} onOpenChange={(o) => !o && setDetailsCompany(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalhes da empresa</DialogTitle>
            <DialogDescription>Informações cadastrais da empresa selecionada.</DialogDescription>
          </DialogHeader>
          {detailsCompany && (
            <div className="space-y-3 text-sm">
              <Row label="Nome" value={detailsCompany.name} />
              <Row label="E-mail" value={detailsCompany.email ?? "—"} />
              <Row label="Telefone" value={detailsCompany.phone ?? "—"} />
              <Row label="Status" value={detailsCompany.status} />
              <Row label="Criada em" value={new Date(detailsCompany.created_at).toLocaleString("pt-BR")} />
              <Row label="ID" value={detailsCompany.id} mono />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!suspendCompany} onOpenChange={(o) => !o && setSuspendCompany(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspender empresa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja suspender <strong>{suspendCompany?.name}</strong>? Os usuários da empresa poderão ter o acesso bloqueado. Nenhum dado será excluído.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (suspendCompany) await changeStatus(suspendCompany, "suspended");
                setSuspendCompany(null);
              }}
            >
              Suspender
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MasterLayout>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs" : "font-medium"}>{value}</span>
    </div>
  );
}
