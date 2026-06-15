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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { LogIn, MoreVertical } from "lucide-react";

interface Company {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  created_at: string;
}

const badge: Record<string, string> = {
  trial: "bg-info/10 text-info border-info/20",
  active: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  suspended: "bg-destructive/10 text-destructive border-destructive/20",
  canceled: "bg-muted text-muted-foreground border-border",
};

export default function MasterEmpresas() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { startImpersonation } = useCompany();
  const isMaster = profile?.is_master === true || profile?.global_role === "master";

  useEffect(() => {
    supabase
      .from("companies")
      .select("id, name, email, phone, status, created_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => setCompanies((data as Company[] | null) ?? []));
  }, []);

  const enterCompany = (c: Company) => {
    if (!isMaster) return;
    startImpersonation(c.id, c.name);
    navigate("/app/dashboard");
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
              {companies.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.email ?? "—"}</TableCell>
                  <TableCell>{c.phone ?? "—"}</TableCell>
                  <TableCell><Badge className={badge[c.status]}>{c.status}</Badge></TableCell>
                  <TableCell>{new Date(c.created_at).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => enterCompany(c)} disabled={!isMaster}>
                      <LogIn className="w-3.5 h-3.5 mr-1.5" /> Entrar como empresa
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </MasterLayout>
  );
}
