import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MessageSquare, Instagram, Facebook, Mail, Loader2, QrCode, RefreshCw, Power, MoreVertical, Settings2, Info, AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
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
import { toast } from "sonner";


const CHANNEL_DEFS = [
  { type: "whatsapp", name: "WhatsApp", icon: MessageSquare, desc: "Conecte sua conta com um QR Code. Sem configurações técnicas.", available: true },
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

const statusLabel: Record<string, string> = {
  connected: "Conectado",
  pending: "Aguardando QR Code",
  disconnected: "Desconectado",
  error: "Erro",
  disabled: "Em breve",
};

export default function Conexoes() {
  const queryClient = useQueryClient();
  const { activeCompanyId } = useCompany();
  const { profile, memberships } = useAuth();
  const isAdmin = useMemo(() => {
    if (profile?.is_master || profile?.global_role === "master") return true;
    const m = memberships.find((x) => x.company_id === activeCompanyId);
    return m?.role === "owner" || m?.role === "admin";
  }, [profile, memberships, activeCompanyId]);
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("disconnected");
  const [instanceName, setInstanceName] = useState<string | null>(null);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const pollRef = useRef<number | null>(null);

  const loadChannels = async () => {
    if (!activeCompanyId) return;
    const { data, error } = await supabase
      .from("channels")
      .select("id, channel_type, status, name")
      .eq("company_id", activeCompanyId);
    if (error) {
      console.error("[Conexoes] loadChannels error", error);
      toast.error(`Não foi possível carregar os canais: ${error.message}`);
      return;
    }
    setChannels((data as ChannelRow[] | null) ?? []);
  };

  useEffect(() => {
    loadChannels();
  }, [activeCompanyId]);

  const stopPolling = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => stopPolling, []);

  const callFn = async (
    action: "create_or_connect" | "status" | "disconnect" | "recreate" | "cleanup_orphan_instances",
    extra: Record<string, unknown> = {},
  ) => {
    if (!activeCompanyId) return null;
    const { data, error } = await supabase.functions.invoke("whatsapp-connection", {
      body: { action, company_id: activeCompanyId, ...extra },
    });
    if (error) {
      toast.error(error.message);
      return null;
    }
    if (data && (data as { error?: string }).error) {
      toast.error((data as { error: string }).error);
      return data as { status: string; qr_code?: string | null; instance_name?: string | null; can_recreate?: boolean };
    }
    return data as { status: string; qr_code?: string | null; instance_name?: string | null; recreated?: boolean; forced?: boolean };
  };

  const invalidateContactCaches = async (reason: "whatsapp_disconnect" | "whatsapp_reconnect") => {
    if (!activeCompanyId) return;
    const queriesInvalidated = [
      "tickets",
      "contacts",
      "messages",
      "channels",
      "whatsapp_instances",
      "event-modal-channels",
      "event-modal-contacts",
      "events-contacts",
    ];
    try {
      Object.keys(sessionStorage)
        .filter((key) => key.startsWith(`dominus:selected_ticket:${activeCompanyId}:`))
        .forEach((key) => sessionStorage.removeItem(key));
    } catch { /* noop */ }
    console.debug("[CONTACT_CACHE_INVALIDATION]", {
      company_id: activeCompanyId,
      channel_id: channels.find((c) => c.channel_type === "whatsapp")?.id ?? null,
      reason,
      queries_invalidated: queriesInvalidated,
    });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["tickets", activeCompanyId] }),
      queryClient.invalidateQueries({ queryKey: ["contacts", activeCompanyId] }),
      queryClient.invalidateQueries({ queryKey: ["messages"] }),
      queryClient.invalidateQueries({ queryKey: ["channels", activeCompanyId] }),
      queryClient.invalidateQueries({ queryKey: ["whatsapp_instances", activeCompanyId] }),
      queryClient.invalidateQueries({ queryKey: ["event-modal-channels", activeCompanyId] }),
      queryClient.invalidateQueries({ queryKey: ["event-modal-contacts", activeCompanyId] }),
      queryClient.invalidateQueries({ queryKey: ["events-contacts", activeCompanyId] }),
    ]);
  };

  const openWhatsAppDialog = async () => {
    setOpen(true);
    setQr(null);
    setStatus("disconnected");
    setInstanceName(null);
    const res = await callFn("status");
    if (res) {
      setStatus(res.status);
      setQr(res.qr_code ?? null);
      setInstanceName(res.instance_name ?? null);
    }
  };

  const generateQr = async () => {
    setLoading(true);
    const res = await callFn("create_or_connect");
    setLoading(false);
    if (!res) return;
    await invalidateContactCaches("whatsapp_reconnect");
    setStatus(res.status);
    setQr(res.qr_code ?? null);
    setInstanceName(res.instance_name ?? null);
    await loadChannels();

    stopPolling();
    pollRef.current = window.setInterval(async () => {
      const s = await callFn("status");
      if (!s) return;
      setStatus(s.status);
      setQr(s.qr_code ?? null);
      if (s.status === "connected" || s.status === "error") {
        stopPolling();
        await loadChannels();
        if (s.status === "connected") toast.success("WhatsApp conectado!");
      }
    }, 4000);
  };

  const disconnect = async (force = false) => {
    setLoading(true);
    const res = await callFn("disconnect", force ? { force: true } : {});
    setLoading(false);
    if (!res) return;
    setStatus(res.status);
    if (res.status === "disconnected") {
      setQr(null);
      stopPolling();
      await invalidateContactCaches("whatsapp_disconnect");
      toast.success(force ? "Conexão marcada como desconectada localmente." : "WhatsApp desconectado.");
    }
    await loadChannels();
  };

  const recreateInstance = async () => {
    if (!confirm("Isso vai recriar a instância do WhatsApp na Evolution e gerar um novo QR Code. Seus contatos, atendimentos e mensagens NÃO serão afetados. Continuar?")) return;
    setLoading(true);
    const res = await callFn("recreate");
    setLoading(false);
    if (!res) return;
    await invalidateContactCaches("whatsapp_reconnect");
    setStatus(res.status);
    setQr(res.qr_code ?? null);
    setInstanceName(res.instance_name ?? null);
    await loadChannels();
    toast.success("Instância recriada. Escaneie o novo QR Code.");

    stopPolling();
    pollRef.current = window.setInterval(async () => {
      const s = await callFn("status");
      if (!s) return;
      setStatus(s.status);
      setQr(s.qr_code ?? null);
      if (s.status === "connected" || s.status === "error") {
        stopPolling();
        await loadChannels();
        if (s.status === "connected") toast.success("WhatsApp conectado!");
      }
    }, 4000);
  };

  const reapplySettings = async (channelId: string) => {
    const { data, error } = await supabase.functions.invoke("sync-evolution-instance-settings", {
      body: { channel_id: channelId },
    });
    if (error || (data as { error?: string } | null)?.error) {
      toast.error("Não foi possível reaplicar as configurações da conexão.");
      return;
    }
    toast.success("Configurações da conexão reaplicadas com sucesso.");
  };

  const cleanupOrphanInstances = async () => {
    setCleanupLoading(true);
    const { data, error } = await supabase.functions.invoke("whatsapp-connection", {
      body: { action: "cleanup_orphan_instances", company_id: activeCompanyId },
    });
    setCleanupLoading(false);
    setCleanupOpen(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const res = data as {
      error?: string;
      message?: string;
      candidates_found?: number;
      removed?: string[];
      failed?: { name: string; error?: string }[];
    } | null;
    if (res?.error) {
      toast.error(res.error);
      return;
    }
    if (res?.failed && res.failed.length > 0) {
      toast.warning(res.message ?? "Limpeza parcial. Algumas instâncias continuam travadas na Evolution.");
    } else {
      toast.success(res?.message ?? "Limpeza concluída.");
    }
    await loadChannels();
    // Refresh status if dialog open
    if (open) {
      const s = await callFn("status");
      if (s) {
        setStatus(s.status);
        setQr(s.qr_code ?? null);
        setInstanceName(s.instance_name ?? null);
      }
    }
  };

  const handleDialogChange = (v: boolean) => {
    setOpen(v);
    if (!v) stopPolling();
  };

  return (
    <AppLayout title="Conexões">
      <div className="p-6">
        <p className="text-muted-foreground mb-4">
          Conecte os canais de atendimento da sua empresa. Sem configurações técnicas — basta clicar e escanear.
        </p>
        <div className="mb-6 flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
          <p>
            <span className="font-medium text-foreground">Observação:</span> ao abrir uma conversa no Dominus, o atendimento
            é marcado como lido dentro do sistema. No momento a API envia o recibo de leitura das mensagens, mas pode não
            sincronizar o estado visual de “não lida” no aplicativo WhatsApp/celular conectado. Essa é uma limitação conhecida
            da integração nessa versão.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-4">
          {CHANNEL_DEFS.map((def) => {
            const existing = channels.find((c) => c.channel_type === def.type);
            const st = existing?.status ?? (def.available ? "disconnected" : "disabled");
            return (
              <Card key={def.type} className="p-5 flex flex-col">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <def.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge className={statusVariant[st] ?? statusVariant.disconnected}>
                      {def.available ? statusLabel[st] ?? st : "Em breve"}
                    </Badge>
                    {def.available && existing && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Mais ações">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => reapplySettings(existing.id)}>
                            <Settings2 className="w-4 h-4 mr-2" />
                            Reaplicar configurações
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
                <h3 className="font-semibold">{def.name}</h3>
                <p className="text-sm text-muted-foreground flex-1 mt-1">{def.desc}</p>

                <Button
                  className="mt-4 w-full"
                  variant={def.available ? "default" : "outline"}
                  disabled={!def.available}
                  onClick={() => def.type === "whatsapp" && openWhatsAppDialog()}
                >
                  {def.available ? (st === "connected" ? "Gerenciar" : "Conectar") : "Preparado para integração"}
                </Button>

              </Card>
            );
          })}
        </div>
      </div>

      <Dialog open={open} onOpenChange={handleDialogChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Conectar WhatsApp</DialogTitle>
            <DialogDescription>
              {status === "connected"
                ? "Sua conta do WhatsApp está conectada."
                : "Clique em \"Gerar QR Code\" e escaneie com o WhatsApp da sua empresa."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-4">
            <Badge className={statusVariant[status] ?? statusVariant.disconnected}>
              {statusLabel[status] ?? status}
            </Badge>

            <div className="w-60 h-60 rounded-lg border bg-muted/30 flex items-center justify-center overflow-hidden">
              {loading ? (
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              ) : qr ? (
                <img src={qr} alt="QR Code WhatsApp" className="w-full h-full object-contain" />
              ) : (
                <QrCode className="w-12 h-12 text-muted-foreground" />
              )}
            </div>

            {instanceName && (
              <p className="text-xs text-muted-foreground font-mono">{instanceName}</p>
            )}

            <div className="flex flex-col gap-2 w-full">
              {status === "connected" ? (
                <Button variant="destructive" className="w-full" onClick={() => disconnect(false)} disabled={loading}>
                  <Power className="w-4 h-4" /> Desconectar
                </Button>
              ) : (
                <Button className="w-full" onClick={generateQr} disabled={loading}>
                  {qr ? <RefreshCw className="w-4 h-4" /> : <QrCode className="w-4 h-4" />}
                  {qr ? "Gerar novo QR Code" : "Gerar QR Code"}
                </Button>
              )}
              <div className="flex gap-2 w-full">
                <Button variant="outline" className="flex-1" onClick={() => disconnect(true)} disabled={loading}>
                  Forçar desconexão local
                </Button>
                <Button variant="outline" className="flex-1" onClick={recreateInstance} disabled={loading}>
                  <RefreshCw className="w-4 h-4" /> Recriar instância
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground text-center">
                Use "Recriar instância" se o WhatsApp estiver travado/inconsistente. Contatos, atendimentos e mensagens não são afetados.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
