import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, Instagram, Facebook, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";

const CHANNEL_DEFS = [
  { type: "whatsapp", name: "WhatsApp", icon: MessageSquare, desc: "Conecte via Evolution API / EvoGo.", available: true },
  { type: "instagram", name: "Instagram", icon: Instagram, desc: "Direct messages via Meta API.", available: false },
  { type: "facebook", name: "Facebook Messenger", icon: Facebook, desc: "Mensagens via Meta API.", available: false },
  { type: "email", name: "E-mail", icon: Mail, desc: "Caixa de entrada via IMAP/SMTP.", available: false },
] as const;

interface ChannelRow {
  id: string;
  channel_type: string;
  status: string;
  name: string;
}

const statusVariant: Record<string, string> = {
  connected: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  disconnected: "bg-muted text-muted-foreground border-border",
  error: "bg-destructive/10 text-destructive border-destructive/20",
  disabled: "bg-muted text-muted-foreground border-border",
};

export default function Conexoes() {
  const { activeCompanyId } = useCompany();
  const [channels, setChannels] = useState<ChannelRow[]>([]);

  useEffect(() => {
    if (!activeCompanyId) return;
    supabase
      .from("channels")
      .select("id, channel_type, status, name")
      .eq("company_id", activeCompanyId)
      .then(({ data }) => setChannels((data as ChannelRow[] | null) ?? []));
  }, [activeCompanyId]);

  return (
    <AppLayout title="Conexões">
      <div className="p-6">
        <p className="text-muted-foreground mb-6">Conecte os canais de atendimento da sua empresa.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-4">
          {CHANNEL_DEFS.map((def) => {
            const existing = channels.find((c) => c.channel_type === def.type);
            const status = existing?.status ?? (def.available ? "disconnected" : "disabled");
            return (
              <Card key={def.type} className="p-5 flex flex-col">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <def.icon className="w-5 h-5 text-primary" />
                  </div>
                  <Badge className={statusVariant[status] ?? statusVariant.disconnected}>
                    {def.available ? status : "Em breve"}
                  </Badge>
                </div>
                <h3 className="font-semibold">{def.name}</h3>
                <p className="text-sm text-muted-foreground flex-1 mt-1">{def.desc}</p>
                <Button
                  className="mt-4 w-full"
                  variant={def.available ? "default" : "outline"}
                  disabled={!def.available}
                >
                  {def.available ? "Conectar" : "Preparado para integração"}
                </Button>
              </Card>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
