import { useEffect, useState } from "react";
import { MasterLayout } from "@/components/MasterLayout";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Building2, CheckCircle, Clock, Users } from "lucide-react";

export default function MasterDashboard() {
  const [stats, setStats] = useState({ total: 0, active: 0, trial: 0, users: 0 });

  useEffect(() => {
    (async () => {
      const [all, active, trial, users] = await Promise.all([
        supabase.from("companies").select("*", { count: "exact", head: true }),
        supabase.from("companies").select("*", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("companies").select("*", { count: "exact", head: true }).eq("status", "trial"),
        supabase.from("profiles").select("*", { count: "exact", head: true }),
      ]);
      setStats({
        total: all.count ?? 0,
        active: active.count ?? 0,
        trial: trial.count ?? 0,
        users: users.count ?? 0,
      });
    })();
  }, []);

  const cards = [
    { label: "Empresas", value: stats.total, icon: Building2 },
    { label: "Ativas", value: stats.active, icon: CheckCircle },
    { label: "Em trial", value: stats.trial, icon: Clock },
    { label: "Usuários", value: stats.users, icon: Users },
  ];

  return (
    <MasterLayout title="Painel Master">
      <div className="p-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{c.label}</p>
                <p className="text-3xl font-bold mt-1">{c.value}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                <c.icon className="w-5 h-5" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </MasterLayout>
  );
}
