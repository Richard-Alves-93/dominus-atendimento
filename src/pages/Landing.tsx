import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  MessageSquare,
  Zap,
  Users,
  Clock,
  History,
  Layers,
  CheckCheck,
  Inbox,
  Send,
  Search,
  Filter,
  ArrowRight,
  BarChart3,
  CalendarClock,
  Megaphone,
  Tag,
  ShieldCheck,
  Building2,
  Smile,
  Mic,
} from "lucide-react";

const problems = [
  "Mensagens que se perdem no WhatsApp",
  "Clientes esperando resposta por horas",
  "Vários atendentes no mesmo número",
  "Ninguém sabe quem está falando com quem",
  "Conversas misturadas entre setores",
  "Sem histórico do que foi combinado",
];

const benefits = [
  { icon: Inbox, title: "Centralize os atendimentos", desc: "Todas as conversas em uma tela simples e organizada." },
  { icon: Layers, title: "Organize por setor", desc: "Separe vendas, suporte, financeiro e recepção." },
  { icon: Users, title: "Defina responsáveis", desc: "Cada conversa com um atendente claro." },
  { icon: Clock, title: "Acompanhe pendências", desc: "Veja o que ainda precisa de resposta." },
  { icon: Zap, title: "Respostas rápidas", desc: "Atalhos para mensagens que sua equipe usa todo dia." },
  { icon: History, title: "Histórico completo", desc: "Toda a conversa do cliente sempre à mão." },
  { icon: CalendarClock, title: "Agendamentos e retornos", desc: "Lembre seus clientes na hora certa." },
  { icon: ShieldCheck, title: "Mais controle da equipe", desc: "Acompanhe o desempenho do seu time." },
];

const steps = [
  { n: "1", title: "Receba as mensagens", desc: "Os atendimentos chegam organizados em uma tela simples." },
  { n: "2", title: "Distribua para a equipe", desc: "Separe por setor e responsável em poucos cliques." },
  { n: "3", title: "Acompanhe tudo", desc: "Veja conversas abertas, pendentes e finalizadas." },
  { n: "4", title: "Nunca perca o histórico", desc: "Cada cliente mantém todo seu histórico de atendimento." },
];

const resources = [
  { icon: MessageSquare, title: "Atendimento pelo WhatsApp" },
  { icon: Layers, title: "Organização por setores" },
  { icon: Users, title: "Responsáveis por conversa" },
  { icon: Zap, title: "Mensagens rápidas" },
  { icon: History, title: "Histórico de clientes" },
  { icon: CalendarClock, title: "Agendamentos e retornos" },
  { icon: Megaphone, title: "Campanhas e prospecção" },
  { icon: BarChart3, title: "Relatórios de atendimento" },
];

function Typewriter({ words }: { words: string[] }) {
  const [index, setIndex] = useState(0);
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const current = words[index];
    let timeout: number;
    if (!deleting && text === current) {
      timeout = window.setTimeout(() => setDeleting(true), 1200);
    } else if (deleting && text === "") {
      setDeleting(false);
      setIndex((i) => (i + 1) % words.length);
    } else {
      timeout = window.setTimeout(
        () => {
          setText(
            deleting
              ? current.slice(0, text.length - 1)
              : current.slice(0, text.length + 1),
          );
        },
        deleting ? 40 : 70,
      );
    }
    return () => clearTimeout(timeout);
  }, [text, deleting, index, words]);

  return (
    <span className="text-primary font-semibold inline-baseline break-words">
      {text}
      <span className="inline-block w-[2px] h-[1em] align-[-2px] bg-primary ml-0.5 animate-pulse" />
    </span>
  );
}

function MockChat() {
  const conversations = [
    { name: "Mariana Souza", msg: "Olá, gostaria de saber mais...", time: "09:42", unread: 2, active: true, dept: "Vendas", resp: "Ana", avatar: "https://i.pravatar.cc/80?img=47" },
    { name: "João Pedro", msg: "Obrigado pelo retorno!", time: "09:28", unread: 0, dept: "Suporte", resp: "Carlos", avatar: "https://i.pravatar.cc/80?img=12" },
    { name: "Clínica Vida", msg: "Pode confirmar o horário?", time: "09:10", unread: 1, dept: "Recepção", resp: "—", avatar: "https://i.pravatar.cc/80?img=32" },
    { name: "Gabriel Cezimbra", msg: "Vou conferir e te respondo", time: "08:55", unread: 0, dept: "Vendas", resp: "Ana", avatar: "https://i.pravatar.cc/80?img=15" },
    { name: "Loja Bella", msg: "Boa tarde, tudo bem?", time: "Ontem", unread: 0, dept: "Financeiro", resp: "Marcos", avatar: "https://i.pravatar.cc/80?img=49" },
  ];


  const navMain = [
    { label: "Painel", icon: BarChart3 },
    { label: "Atendimentos", icon: MessageSquare, active: true },
    { label: "Contatos", icon: Users },
    { label: "Mensagens Rápidas", icon: Tag },
    { label: "Campanhas", icon: Megaphone },
    { label: "Agendamentos", icon: CalendarClock },
  ];
  const navConfig = [
    { label: "Conexões", icon: Building2 },
    { label: "Setores", icon: Layers },
    { label: "Equipe", icon: Users },
  ];

  return (
    <div className="rounded-xl border bg-card shadow-elevated overflow-hidden w-full max-w-full min-w-0">
      {/* Top window bar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-muted/40">
        <span className="w-2.5 h-2.5 rounded-full bg-destructive/70 shrink-0" />
        <span className="w-2.5 h-2.5 rounded-full bg-warning/70 shrink-0" />
        <span className="w-2.5 h-2.5 rounded-full bg-success/70 shrink-0" />
        <span className="ml-3 text-[11px] text-muted-foreground truncate">painel.crmdominus.com.br/app/tickets</span>
      </div>

      <div className="grid grid-cols-[44px_112px_minmax(0,1fr)] min-[390px]:grid-cols-[48px_126px_minmax(0,1fr)] sm:grid-cols-[160px_210px_minmax(0,1fr)] lg:grid-cols-[190px_240px_minmax(0,1fr)] h-[360px] min-[390px]:h-[390px] sm:h-[440px] lg:h-[460px] text-sm min-w-0">

        {/* Sidebar */}
        <aside className="bg-[#0b1220] text-slate-200 flex flex-col min-w-0 overflow-hidden">
          <div className="flex items-center gap-2 px-3 h-12 border-b border-white/10">
            <div className="w-7 h-7 rounded-md gradient-primary flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-[13px] tracking-tight">Dominus</span>
          </div>
          <nav className="flex-1 px-2 py-3 text-[12px] overflow-hidden">
            <div className="px-2 pb-1 text-[9.5px] uppercase tracking-wider text-slate-400/70">Menu</div>
            <div className="space-y-0.5 mb-3">
              {navMain.map((i) => (
                <div
                  key={i.label}
                  className={`px-2 py-1.5 rounded-md flex items-center gap-2 ${
                    i.active
                      ? "bg-primary/20 text-white font-medium"
                      : "text-slate-300/80 hover:bg-white/5"
                  }`}
                >
                  <i.icon className="w-3.5 h-3.5 shrink-0" />{" "}
                  <span className="hidden sm:inline truncate">{i.label}</span>
                </div>
              ))}
            </div>
            <div className="px-2 pb-1 text-[9.5px] uppercase tracking-wider text-slate-400/70 hidden sm:block">Configuração</div>
            <div className="space-y-0.5 hidden sm:block">
              {navConfig.map((i) => (
                <div key={i.label} className="px-2 py-1.5 rounded-md flex items-center gap-2 text-slate-300/80">
                  <i.icon className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{i.label}</span>
                </div>
              ))}
            </div>
          </nav>
          <div className="px-3 py-2 border-t border-white/10 flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-primary/30 text-white flex items-center justify-center text-[10px] font-semibold shrink-0">A</div>
            <div className="leading-tight hidden sm:block min-w-0">
              <div className="text-[11px] font-medium truncate">Ana Lima</div>
              <div className="text-[9.5px] text-slate-400 truncate">Rives Atendimento</div>
            </div>
          </div>
        </aside>

        {/* Conversation list */}
        <div className="border-r flex flex-col bg-background min-w-0 overflow-hidden">
          <div className="px-2 sm:px-3 pt-2.5 pb-1.5 flex items-center justify-between gap-1 min-w-0">
            <span className="text-[13px] font-semibold">Atendimentos</span>
            <span className="text-[10px] text-muted-foreground shrink-0 hidden min-[390px]:inline">{conversations.length} ativos</span>
          </div>
          <div className="px-2 sm:px-3 pb-2 flex items-center gap-1.5 min-w-0">
            <div className="flex-1 h-7 rounded-md border bg-muted/40 flex items-center gap-1.5 px-2">
              <Search className="w-3 h-3 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground truncate hidden min-[390px]:inline">Buscar atendimentos...</span>
            </div>
            <button className="w-7 h-7 rounded-md gradient-primary flex items-center justify-center shrink-0">
              <span className="text-primary-foreground text-sm leading-none">+</span>
            </button>
          </div>
          <div className="px-2 pb-1.5 flex gap-1 border-b overflow-hidden">
            <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-primary text-primary-foreground">Abertos</span>
            <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground hidden min-[390px]:inline">Pendentes</span>
            <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground hidden sm:inline">Fechados</span>
          </div>
          <div className="px-2 py-1.5 border-b flex items-center gap-1 text-[10.5px] text-muted-foreground">
            <Filter className="w-3 h-3" /> Todos os setores
          </div>
          <div className="flex-1 overflow-hidden">
            {conversations.map((c) => {
              const initials = c.name.split(" ").slice(0, 2).map((n) => n[0]).join("");
              return (
                <div
                  key={c.name}
                  className={`px-2.5 py-2 border-b cursor-pointer flex gap-2 ${c.active ? "bg-primary/5" : ""}`}
                >
                  <div className="h-8 w-8 rounded-full overflow-hidden bg-primary/15 text-primary flex items-center justify-center text-[10px] font-semibold shrink-0">
                    <img
                      src={c.avatar}
                      alt={c.name}
                      className="h-8 w-8 rounded-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                        (e.currentTarget.parentElement as HTMLElement).innerText = initials;
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[12px] truncate">{c.name}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0 ml-1">{c.time}</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[11px] text-muted-foreground truncate pr-2">{c.msg}</span>
                      {c.unread > 0 && (
                        <span className="text-[9.5px] min-w-[15px] h-[15px] px-1 rounded-full bg-success text-white flex items-center justify-center shrink-0">
                          {c.unread}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[9px] px-1.5 py-[1px] rounded-full bg-muted text-muted-foreground">{c.dept}</span>
                      <span className="text-[9px] text-muted-foreground">· {c.resp}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chat */}
        <section className="flex flex-col bg-[hsl(var(--muted))]/30 min-w-0 overflow-hidden">
          <div className="h-14 border-b px-2 sm:px-4 flex items-center justify-between bg-background gap-2 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-full overflow-hidden shrink-0 bg-primary/15">
                <img
                  src="https://i.pravatar.cc/80?img=47"
                  alt="Mariana Souza"
                  className="h-9 w-9 rounded-full object-cover"
                />
              </div>
              <div className="leading-tight min-w-0">
                <div className="text-[13px] font-semibold truncate">Mariana Souza</div>
                <div className="text-[10.5px] text-muted-foreground truncate">
                  +55 21 99876-5432 · Vendas · Responsável: Ana
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success font-medium">
                Aberto
              </span>
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
          </div>

          <div className="flex-1 px-2 sm:px-4 py-4 space-y-2 overflow-hidden">
            <div className="flex justify-start">
              <div className="max-w-[78%] bg-background border rounded-2xl rounded-tl-sm px-3 py-2 text-[12.5px] shadow-card">
                Olá, gostaria de saber mais sobre o serviço.
                <div className="text-[9.5px] text-muted-foreground text-right mt-0.5">09:40</div>
              </div>
            </div>
            <div className="flex justify-end">
              <div className="max-w-[78%] bg-success/15 border border-success/20 rounded-2xl rounded-tr-sm px-3 py-2 text-[12.5px]">
                Olá! Claro, vou te ajudar.
                <div className="flex items-center justify-end gap-1 text-[9.5px] text-muted-foreground mt-0.5">
                  09:41 <CheckCheck className="w-3 h-3 text-success" />
                </div>
              </div>
            </div>
            <div className="flex justify-start">
              <div className="max-w-[78%] bg-background border rounded-2xl rounded-tl-sm px-3 py-2 text-[12.5px] shadow-card">
                Vocês conseguem me retornar ainda hoje?
                <div className="text-[9.5px] text-muted-foreground text-right mt-0.5">09:42</div>
              </div>
            </div>
            <div className="flex justify-end">
              <div className="max-w-[78%] bg-success/15 border border-success/20 rounded-2xl rounded-tr-sm px-3 py-2 text-[12.5px]">
                Sim, já deixei seu atendimento com o setor responsável.
                <div className="flex items-center justify-end gap-1 text-[9.5px] text-muted-foreground mt-0.5">
                  09:42 <CheckCheck className="w-3 h-3 text-success" />
                </div>
              </div>
            </div>
          </div>

          {/* Composer */}
          <div className="border-t bg-background px-2 sm:px-3 py-2 flex items-center gap-1 sm:gap-2">
            <button className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-sm leading-none shrink-0">+</button>
            <Tag className="w-4 h-4 text-muted-foreground shrink-0 hidden sm:block" />
            <div className="flex-1 min-w-0 h-8 rounded-full bg-muted px-3 flex items-center text-[12px] text-muted-foreground truncate">
              Digite uma mensagem
            </div>
            <Smile className="w-4 h-4 text-muted-foreground shrink-0 hidden sm:block" />
            <Mic className="w-4 h-4 text-muted-foreground shrink-0" />
            <button className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center shrink-0">
              <Send className="w-3.5 h-3.5 text-primary-foreground" />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <header className="border-b sticky top-0 bg-background/80 backdrop-blur z-40">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg gradient-primary flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-sm sm:text-lg truncate">
              <span className="hidden sm:inline">Dominus Atendimento</span>
              <span className="sm:hidden">Dominus</span>
            </span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <Button asChild variant="ghost" className="hidden md:inline-flex">
              <a href="#como-funciona">Como funciona</a>
            </Button>
            <Button asChild variant="ghost" size="sm"><Link to="/auth">Entrar</Link></Button>
            <Button asChild size="sm" className="gradient-primary text-primary-foreground">
              <Link to="/cadastro">Começar</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-12 md:pt-24 md:pb-16 overflow-hidden">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div className="text-center lg:text-left">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-5 leading-[1.1] break-words">
                Organize todos os atendimentos da sua empresa em um só lugar.
              </h1>
              <p className="text-base md:text-lg text-muted-foreground mb-7 max-w-xl mx-auto lg:mx-0">
                Com o Dominus, sua equipe centraliza atendimentos de{" "}
                <Typewriter words={["WhatsApp", "Instagram", "Facebook", "E-mail", "todos os seus canais"]} />{" "}
                com mais organização, histórico, setores, responsáveis e
                acompanhamento em tempo real.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3">
                <Button asChild size="lg" className="gradient-primary text-primary-foreground w-full sm:w-auto">
                  <Link to="/cadastro">Começar agora <ArrowRight className="w-4 h-4 ml-2" /></Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                  <a href="#como-funciona">Ver como funciona</a>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Teste grátis · Sem cartão de crédito · Suporte em português
              </p>
            </div>

            <div className="lg:pl-4 w-full max-w-full">
              <div className="w-full max-w-[560px] mx-auto">
                <MockChat />
              </div>
            </div>
          </div>
        </section>


        {/* PROBLEMAS */}
        <section className="bg-muted/30 border-y">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
            <div className="max-w-3xl mx-auto text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-bold mb-3">
                Chega de perder clientes no WhatsApp.
              </h2>
              <p className="text-muted-foreground">
                Se sua empresa atende clientes pelo WhatsApp, você sabe como é fácil perder uma mensagem
                importante. Com o Dominus, cada conversa fica organizada, com responsável, setor e
                histórico completo.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-4xl mx-auto">
              {problems.map((p) => (
                <div key={p} className="flex items-start gap-2 p-4 rounded-lg bg-card border">
                  <span className="w-1.5 h-1.5 rounded-full bg-destructive mt-2 shrink-0" />
                  <span className="text-sm">{p}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* BENEFÍCIOS */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold mb-3">Tudo o que sua equipe precisa</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Ferramentas simples para atender melhor, responder mais rápido e acompanhar tudo o
              que acontece com seus clientes.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {benefits.map((b) => (
              <div key={b.title} className="p-5 rounded-xl border bg-card hover:shadow-card transition-shadow">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                  <b.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold mb-1 text-[15px]">{b.title}</h3>
                <p className="text-sm text-muted-foreground">{b.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* COMO FUNCIONA */}
        <section id="como-funciona" className="bg-muted/30 border-y">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-bold mb-3">Como o Dominus ajuda</h2>
              <p className="text-muted-foreground">Em quatro passos simples, sua empresa atende melhor.</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {steps.map((s) => (
                <div key={s.n} className="p-5 rounded-xl bg-card border">
                  <div className="w-9 h-9 rounded-full gradient-primary text-primary-foreground flex items-center justify-center font-bold mb-3">
                    {s.n}
                  </div>
                  <h3 className="font-semibold mb-1">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* RECURSOS */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold mb-3">Recursos do Dominus</h2>
            <p className="text-muted-foreground">
              Preparado para evoluir com novos canais de atendimento.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {resources.map((r) => (
              <div key={r.title} className="flex items-center gap-3 p-4 rounded-lg border bg-card">
                <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                  <r.icon className="w-4.5 h-4.5 text-success" />
                </div>
                <span className="text-sm font-medium">{r.title}</span>
              </div>
            ))}
          </div>
        </section>

        {/* CTA FINAL */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
          <div className="rounded-2xl gradient-primary text-primary-foreground p-6 sm:p-10 md:p-14 text-center shadow-elevated">
            <h2 className="text-2xl md:text-4xl font-bold mb-3">
              Atenda melhor. Responda mais rápido. Não perca mais nenhum cliente.
            </h2>
            <p className="opacity-90 max-w-2xl mx-auto mb-7">
              Comece agora gratuitamente e veja como o Dominus transforma o atendimento da sua empresa.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
                <Link to="/cadastro">Começar agora <ArrowRight className="w-4 h-4 ml-2" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto bg-transparent text-primary-foreground border-primary-foreground/30 hover:bg-primary-foreground/10 hover:text-primary-foreground">
                <Link to="/auth">Já tenho conta</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md gradient-primary flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span>© {new Date().getFullYear()} Dominus Atendimento</span>
          </div>
          <span>Feito para empresas que atendem de verdade.</span>
        </div>
      </footer>
    </div>
  );
}
