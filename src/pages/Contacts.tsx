import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Search, Plus, MessageSquare, MoreHorizontal } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type Contact = {
  id: string;
  name: string | null;
  phone_number: string | null;
  email: string | null;
  avatar_url: string | null;
  updated_at: string;
};

const initialsOf = (name: string | null, phone: string | null) => {
  const base = (name ?? phone ?? "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
};

const Contacts = () => {
  const [search, setSearch] = useState("");
  const { activeCompanyId } = useCompany();

  const { data: contacts = [], isLoading } = useQuery({
    enabled: !!activeCompanyId,
    queryKey: ["contacts", activeCompanyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id,name,phone_number,email,avatar_url,updated_at")
        .eq("company_id", activeCompanyId!)
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Contact[];
    },
  });

  const q = search.toLowerCase();
  const filtered = contacts.filter(
    (c) =>
      (c.name ?? "").toLowerCase().includes(q) ||
      (c.phone_number ?? "").includes(search) ||
      (c.email ?? "").toLowerCase().includes(q)
  );

  return (
    <AppLayout title="Contatos">
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar contatos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 bg-card border-border"
            />
          </div>
          <Button className="gradient-primary text-primary-foreground gap-2">
            <Plus className="w-4 h-4" />
            Novo Contato
          </Button>
        </div>

        <Card className="shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="text-left text-xs font-medium text-muted-foreground p-3">Contato</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-3">Telefone</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-3 hidden md:table-cell">E-mail</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-3 hidden sm:table-cell">Último Contato</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">Carregando…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">Nenhum contato encontrado.</td></tr>
                ) : filtered.map((contact) => (
                  <tr key={contact.id} className="border-b last:border-0 hover:bg-secondary/30 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                            {initialsOf(contact.name, contact.phone_number)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-sm text-foreground">
                          {contact.name || contact.phone_number || "Sem nome"}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-sm text-muted-foreground">{contact.phone_number || "—"}</td>
                    <td className="p-3 text-sm text-muted-foreground hidden md:table-cell">{contact.email || "—"}</td>
                    <td className="p-3 text-sm text-muted-foreground hidden sm:table-cell">
                      {formatDistanceToNow(new Date(contact.updated_at), { addSuffix: true, locale: ptBR })}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                          <MessageSquare className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Contacts;
