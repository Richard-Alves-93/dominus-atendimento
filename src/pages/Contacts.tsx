import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Search, Plus, Phone, Mail, MessageSquare, MoreHorizontal } from "lucide-react";

const mockContacts = [
  { id: 1, name: "Maria Silva", phone: "+55 11 99999-1234", email: "maria@email.com", initials: "MS", tags: ["VIP", "Vendas"], lastContact: "Hoje" },
  { id: 2, name: "João Santos", phone: "+55 21 98888-5678", email: "joao@email.com", initials: "JS", tags: ["Suporte"], lastContact: "Ontem" },
  { id: 3, name: "Ana Costa", phone: "+55 31 97777-9012", email: "ana@email.com", initials: "AC", tags: ["Financeiro"], lastContact: "2 dias" },
  { id: 4, name: "Carlos Oliveira", phone: "+55 41 96666-3456", email: "carlos@email.com", initials: "CO", tags: ["Vendas"], lastContact: "3 dias" },
  { id: 5, name: "Lucia Ferreira", phone: "+55 51 95555-7890", email: "lucia@email.com", initials: "LF", tags: ["VIP", "Suporte"], lastContact: "1 semana" },
  { id: 6, name: "Pedro Almeida", phone: "+55 61 94444-1234", email: "pedro@email.com", initials: "PA", tags: ["Vendas"], lastContact: "1 semana" },
  { id: 7, name: "Beatriz Lima", phone: "+55 71 93333-5678", email: "beatriz@email.com", initials: "BL", tags: ["Suporte", "Financeiro"], lastContact: "2 semanas" },
  { id: 8, name: "Rafael Souza", phone: "+55 81 92222-9012", email: "rafael@email.com", initials: "RS", tags: ["VIP"], lastContact: "2 semanas" },
];

const tagColors: Record<string, string> = {
  VIP: "bg-primary/10 text-primary border-primary/20",
  Vendas: "bg-info/10 text-info border-info/20",
  Suporte: "bg-warning/10 text-warning border-warning/20",
  Financeiro: "bg-destructive/10 text-destructive border-destructive/20",
};

const Contacts = () => {
  const [search, setSearch] = useState("");

  const filtered = mockContacts.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
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
                  <th className="text-left text-xs font-medium text-muted-foreground p-3 hidden lg:table-cell">Tags</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-3 hidden sm:table-cell">Último Contato</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((contact) => (
                  <tr key={contact.id} className="border-b last:border-0 hover:bg-secondary/30 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                            {contact.initials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-sm text-foreground">{contact.name}</span>
                      </div>
                    </td>
                    <td className="p-3 text-sm text-muted-foreground">{contact.phone}</td>
                    <td className="p-3 text-sm text-muted-foreground hidden md:table-cell">{contact.email}</td>
                    <td className="p-3 hidden lg:table-cell">
                      <div className="flex gap-1 flex-wrap">
                        {contact.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className={`text-[10px] font-medium ${tagColors[tag] || ""}`}>
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-sm text-muted-foreground hidden sm:table-cell">{contact.lastContact}</td>
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
