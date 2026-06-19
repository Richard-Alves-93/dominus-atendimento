import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Users, Clock, CheckCircle, TrendingUp } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useMemo } from "react";

type Row = { created_at: string; status: string; assigned_user_id: string | null; updated_at: string };

const Dashboard = () => {
  const { activeCompanyId } = useCompany();

  const since = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  const todayStartIso = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);
  const todayStart = useMemo(() => new Date(todayStartIso).getTime(), [todayStartIso]);

  const { data, isLoading } = useQuery({
    enabled: !!activeCompanyId,
    queryKey: ["dashboard-tickets", activeCompanyId, since, todayStartIso],
    queryFn: async () => {
      const [
        ticketsRes,
        openRes,
        pendingRes,
        resolvedTodayRes,
        contactsRes,
        profilesRes,
      ] = await Promise.all([
        supabase
          .from("tickets")
          .select("created_at,status,assigned_user_id,updated_at")
          .eq("company_id", activeCompanyId!)
          .gte("created_at", since),
        supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("company_id", activeCompanyId!)
          .eq("status", "open"),
        supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("company_id", activeCompanyId!)
          .eq("status", "pending"),
        supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("company_id", activeCompanyId!)
          .eq("status", "closed")
          .gte("updated_at", todayStartIso),
        supabase
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .eq("company_id", activeCompanyId!),
        supabase
          .from("company_users")
          .select("user_id")
          .eq("company_id", activeCompanyId!)
          .eq("status", "active"),
      ]);
      const memberIds = (profilesRes.data ?? []).map((m: { user_id: string }) => m.user_id);
      let members: Array<{ user_id: string; full_name: string | null }> = [];
      if (memberIds.length > 0) {
        const profRes = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", memberIds);
        members = (profRes.data ?? []).map((p: { id: string; full_name: string | null }) => ({
          user_id: p.id,
          full_name: p.full_name,
        }));
      }
      return {
        tickets: (ticketsRes.data ?? []) as Row[],
        openCount: openRes.count ?? 0,
        pendingCount: pendingRes.count ?? 0,
        resolvedTodayCount: resolvedTodayRes.count ?? 0,
        contactsCount: contactsRes.count ?? 0,
        members,
      };
    },
  });

  const tickets = data?.tickets ?? [];

  const stats = useMemo(() => {
    return [
      { label: "Atendimentos Abertos", value: String(data?.openCount ?? 0), icon: MessageSquare, color: "text-primary", hint: "Status aberto agora" },
      { label: "Pendentes", value: String(data?.pendingCount ?? 0), icon: Clock, color: "text-warning", hint: "Aguardando resposta" },
      { label: "Resolvidos Hoje", value: String(data?.resolvedTodayCount ?? 0), icon: CheckCircle, color: "text-success", hint: "Fechados hoje" },
      { label: "Total Contatos", value: (data?.contactsCount ?? 0).toLocaleString("pt-BR"), icon: Users, color: "text-info", hint: "Base de contatos" },
    ];
  }, [data]);

  const chartData = useMemo(() => {
    const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const buckets: Record<string, { tickets: number; resolvidos: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      buckets[d.toISOString().slice(0, 10)] = { tickets: 0, resolvidos: 0 };
    }
    tickets.forEach((t) => {
      const key = new Date(t.created_at).toISOString().slice(0, 10);
      if (buckets[key]) buckets[key].tickets += 1;
      if (t.status === "closed") {
        const k2 = new Date(t.updated_at).toISOString().slice(0, 10);
        if (buckets[k2]) buckets[k2].resolvidos += 1;
      }
    });
    return Object.entries(buckets).map(([date, v]) => ({
      name: days[new Date(date + "T00:00:00").getDay()],
      ...v,
    }));
  }, [tickets]);

  const attendantData = useMemo(() => {
    const nameById = new Map<string, string>();
    (data?.members ?? []).forEach((m) => {
      nameById.set(m.user_id, m.full_name ?? "—");
    });
    const counts: Record<string, number> = {};
    tickets.forEach((t) => {
      if (!t.assigned_user_id) return;
      counts[t.assigned_user_id] = (counts[t.assigned_user_id] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([uid, n]) => ({ name: (nameById.get(uid) ?? "—").split(" ")[0], tickets: n }))
      .sort((a, b) => b.tickets - a.tickets)
      .slice(0, 5);
  }, [tickets, data?.members]);

  return (
    <AppLayout title="Painel">
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="shadow-card hover:shadow-elevated transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="text-3xl font-bold text-foreground mt-1">
                      {isLoading ? "…" : stat.value}
                    </p>
                  </div>
                  <div className={`p-2.5 rounded-xl bg-secondary ${stat.color}`}>
                    <stat.icon className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">{stat.hint}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Atendimentos por Dia
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorTickets" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(142, 70%, 45%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(142, 70%, 45%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                    <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip />
                    <Area type="monotone" dataKey="tickets" stroke="hsl(142, 70%, 45%)" fill="url(#colorTickets)" strokeWidth={2} />
                    <Area type="monotone" dataKey="resolvidos" stroke="hsl(210, 100%, 52%)" fill="transparent" strokeWidth={2} strokeDasharray="5 5" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Top Atendentes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {attendantData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                    Sem dados nos últimos 7 dias
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={attendantData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" horizontal={false} />
                      <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                      <YAxis dataKey="name" type="category" fontSize={12} tickLine={false} axisLine={false} width={60} />
                      <Tooltip />
                      <Bar dataKey="tickets" fill="hsl(142, 70%, 45%)" radius={[0, 4, 4, 0]} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
