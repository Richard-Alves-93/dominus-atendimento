import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, Plus, Send, Paperclip, Smile, Phone, MoreVertical, Check, CheckCheck, MessageSquare } from "lucide-react";

interface Message {
  id: number;
  text: string;
  time: string;
  fromMe: boolean;
  status?: "sent" | "delivered" | "read";
}

interface Ticket {
  id: number;
  contact: string;
  initials: string;
  lastMessage: string;
  time: string;
  unread: number;
  status: "open" | "pending" | "closed";
  queue: string;
  queueColor: string;
}

const mockTickets: Ticket[] = [
  { id: 1, contact: "Maria Silva", initials: "MS", lastMessage: "Olá, preciso de ajuda com meu pedido", time: "10:32", unread: 3, status: "open", queue: "Vendas", queueColor: "bg-primary" },
  { id: 2, contact: "João Santos", initials: "JS", lastMessage: "Já fiz o pagamento", time: "09:45", unread: 0, status: "open", queue: "Financeiro", queueColor: "bg-info" },
  { id: 3, contact: "Ana Costa", initials: "AC", lastMessage: "Quando chega minha encomenda?", time: "09:15", unread: 1, status: "pending", queue: "Suporte", queueColor: "bg-warning" },
  { id: 4, contact: "Carlos Oliveira", initials: "CO", lastMessage: "Obrigado pelo atendimento!", time: "Ontem", unread: 0, status: "closed", queue: "Vendas", queueColor: "bg-primary" },
  { id: 5, contact: "Lucia Ferreira", initials: "LF", lastMessage: "Quero fazer um orçamento", time: "Ontem", unread: 0, status: "open", queue: "Vendas", queueColor: "bg-primary" },
];

const mockMessages: Message[] = [
  { id: 1, text: "Olá! Boa tarde 😊", time: "10:28", fromMe: false },
  { id: 2, text: "Boa tarde! Como posso ajudar?", time: "10:29", fromMe: true, status: "read" },
  { id: 3, text: "Preciso de ajuda com meu pedido #4521. Não recebi a confirmação por e-mail.", time: "10:30", fromMe: false },
  { id: 4, text: "Claro! Vou verificar o status do seu pedido agora mesmo.", time: "10:31", fromMe: true, status: "read" },
  { id: 5, text: "Olá, preciso de ajuda com meu pedido", time: "10:32", fromMe: false },
];

const StatusIcon = ({ status }: { status?: string }) => {
  if (status === "read") return <CheckCheck className="w-3.5 h-3.5 text-primary" />;
  if (status === "delivered") return <CheckCheck className="w-3.5 h-3.5 text-muted-foreground" />;
  return <Check className="w-3.5 h-3.5 text-muted-foreground" />;
};

const Tickets = () => {
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(mockTickets[0]);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<"open" | "pending" | "closed">("open");

  const filteredTickets = mockTickets.filter((t) => t.status === filter);

  return (
    <AppLayout title="Tickets">
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Ticket List */}
        <div className="w-80 border-r flex flex-col bg-card flex-shrink-0">
          <div className="p-3 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar tickets..." className="pl-9 h-9 bg-secondary border-0" />
            </div>
            <div className="flex gap-1">
              {(["open", "pending", "closed"] as const).map((s) => (
                <Button
                  key={s}
                  variant={filter === s ? "default" : "ghost"}
                  size="sm"
                  className={`flex-1 text-xs h-8 ${filter === s ? "gradient-primary text-primary-foreground" : "text-muted-foreground"}`}
                  onClick={() => setFilter(s)}
                >
                  {s === "open" ? "Abertos" : s === "pending" ? "Pendentes" : "Fechados"}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {filteredTickets.map((ticket) => (
              <div
                key={ticket.id}
                onClick={() => setSelectedTicket(ticket)}
                className={`flex items-start gap-3 px-3 py-3 cursor-pointer border-b transition-colors hover:bg-secondary/50 ${
                  selectedTicket?.id === ticket.id ? "bg-secondary" : ""
                }`}
              >
                <Avatar className="h-10 w-10 flex-shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                    {ticket.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm text-foreground truncate">{ticket.contact}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{ticket.time}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{ticket.lastMessage}</p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className={`inline-block w-2 h-2 rounded-full ${ticket.queueColor}`} />
                    <span className="text-[10px] text-muted-foreground">{ticket.queue}</span>
                  </div>
                </div>
                {ticket.unread > 0 && (
                  <Badge className="gradient-primary text-primary-foreground text-[10px] h-5 min-w-5 flex items-center justify-center rounded-full px-1.5">
                    {ticket.unread}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        {selectedTicket ? (
          <div className="flex-1 flex flex-col min-w-0">
            {/* Chat Header */}
            <div className="h-14 flex items-center justify-between px-4 border-b bg-card">
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {selectedTicket.initials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-sm text-foreground">{selectedTicket.contact}</p>
                  <p className="text-xs text-muted-foreground">#{selectedTicket.id} · {selectedTicket.queue}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="text-muted-foreground h-8 w-8">
                  <Phone className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="text-muted-foreground h-8 w-8">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-secondary/30 scrollbar-thin" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%239C92AC\' fill-opacity=\'0.03\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}>
              {mockMessages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.fromMe ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                      msg.fromMe
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-card text-foreground shadow-card rounded-bl-md"
                    }`}
                  >
                    <p className="text-sm leading-relaxed">{msg.text}</p>
                    <div className={`flex items-center justify-end gap-1 mt-1 ${msg.fromMe ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                      <span className="text-[10px]">{msg.time}</span>
                      {msg.fromMe && <StatusIcon status={msg.status} />}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Message Input */}
            <div className="p-3 border-t bg-card">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="text-muted-foreground h-9 w-9 flex-shrink-0">
                  <Smile className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="icon" className="text-muted-foreground h-9 w-9 flex-shrink-0">
                  <Paperclip className="w-5 h-5" />
                </Button>
                <Input
                  placeholder="Digite uma mensagem..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="flex-1 h-10 bg-secondary border-0 rounded-full px-4"
                />
                <Button size="icon" className="gradient-primary text-primary-foreground h-10 w-10 rounded-full flex-shrink-0">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-secondary/20">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">Selecione um ticket para visualizar</p>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Tickets;
