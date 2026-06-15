import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Users, Clock, CheckCircle, TrendingUp, ArrowUpRight } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

const stats = [
  { label: "Atendimentos Abertos", value: "42", change: "+12%", icon: MessageSquare, color: "text-primary" },
  { label: "Em Atendimento", value: "18", change: "+5%", icon: Clock, color: "text-warning" },
  { label: "Resolvidos Hoje", value: "67", change: "+23%", icon: CheckCircle, color: "text-success" },
  { label: "Total Contatos", value: "1.284", change: "+8%", icon: Users, color: "text-info" },
];

const chartData = [
  { name: "Seg", tickets: 40, resolvidos: 35 },
  { name: "Ter", tickets: 55, resolvidos: 48 },
  { name: "Qua", tickets: 38, resolvidos: 42 },
  { name: "Qui", tickets: 62, resolvidos: 55 },
  { name: "Sex", tickets: 48, resolvidos: 44 },
  { name: "Sáb", tickets: 25, resolvidos: 28 },
  { name: "Dom", tickets: 15, resolvidos: 18 },
];

const attendantData = [
  { name: "Maria", tickets: 23 },
  { name: "João", tickets: 19 },
  { name: "Ana", tickets: 16 },
  { name: "Carlos", tickets: 12 },
  { name: "Lucia", tickets: 9 },
];

const Dashboard = () => {
  return (
    <AppLayout title="Painel">
      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="shadow-card hover:shadow-elevated transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="text-3xl font-bold text-foreground mt-1">{stat.value}</p>
                  </div>
                  <div className={`p-2.5 rounded-xl bg-secondary ${stat.color}`}>
                    <stat.icon className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-3 text-sm text-success">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span className="font-medium">{stat.change}</span>
                  <span className="text-muted-foreground">vs semana anterior</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts */}
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
                    <YAxis fontSize={12} tickLine={false} axisLine={false} />
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
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={attendantData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" horizontal={false} />
                    <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis dataKey="name" type="category" fontSize={12} tickLine={false} axisLine={false} width={50} />
                    <Tooltip />
                    <Bar dataKey="tickets" fill="hsl(142, 70%, 45%)" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
