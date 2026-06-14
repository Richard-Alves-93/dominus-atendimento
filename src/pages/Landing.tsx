import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MessageSquare, Zap, Users, BarChart3, Sparkles, ArrowRight } from "lucide-react";

const features = [
  { icon: MessageSquare, title: "Multicanal", desc: "WhatsApp, Instagram, Facebook e E-mail em uma única caixa de entrada." },
  { icon: Users, title: "Multiempresa", desc: "Isole dados, equipes e métricas por empresa com total segurança." },
  { icon: BarChart3, title: "Dashboard em tempo real", desc: "Acompanhe atendimentos, conversões e desempenho do time." },
  { icon: Sparkles, title: "Automação & IA", desc: "Chatbot e fluxos inteligentes prontos para escalar o atendimento." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg gradient-primary flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg">Dominus Atendimento</span>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost"><Link to="/auth">Entrar</Link></Button>
            <Button asChild className="gradient-primary text-primary-foreground"><Link to="/cadastro">Começar grátis</Link></Button>
          </div>
        </div>
      </header>

      <main>
        <section className="max-w-6xl mx-auto px-6 py-24 text-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6">
            <Sparkles className="w-3.5 h-3.5" /> SaaS de atendimento multicanal
          </span>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            Centralize o atendimento da sua empresa.
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            O Dominus Atendimento unifica WhatsApp, Instagram, Facebook e e-mail em uma plataforma simples, segura e multiempresa.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button asChild size="lg" className="gradient-primary text-primary-foreground">
              <Link to="/cadastro">Começar grátis <ArrowRight className="w-4 h-4 ml-2" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline"><Link to="/auth">Entrar</Link></Button>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-6 pb-24">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((f) => (
              <div key={f.title} className="p-6 rounded-xl border bg-card">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold mb-1">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="max-w-6xl mx-auto px-6 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Dominus Atendimento. Todos os direitos reservados.
        </div>
      </footer>
    </div>
  );
}
