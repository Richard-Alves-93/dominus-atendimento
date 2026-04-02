import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MessageSquare, Eye, EyeOff } from "lucide-react";
import loginBg from "@/assets/login-bg.jpg";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center overflow-hidden">
        <img src={loginBg} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/80 to-primary/40 backdrop-blur-sm" />
        <div className="relative z-10 text-center px-12">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center shadow-elevated">
              <MessageSquare className="w-7 h-7 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-primary-foreground mb-4">ZapPro</h1>
          <p className="text-lg text-primary-foreground/80 max-w-md">
            Gerencie todos os seus atendimentos via WhatsApp em um só lugar. Rápido, moderno e eficiente.
          </p>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <Card className="w-full max-w-md border-0 shadow-none bg-transparent">
          <CardHeader className="text-center space-y-2 pb-2">
            <div className="flex items-center justify-center gap-2 lg:hidden mb-4">
              <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-foreground">ZapPro</span>
            </div>
            <h2 className="text-2xl font-bold text-foreground">Bem-vindo de volta</h2>
            <p className="text-muted-foreground">Entre com suas credenciais para acessar</p>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 bg-secondary border-border focus:ring-primary"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-foreground">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 bg-secondary border-border focus:ring-primary pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full h-11 gradient-primary text-primary-foreground font-medium text-base hover:opacity-90 transition-opacity">
                Entrar
              </Button>
            </form>
            <p className="text-center text-sm text-muted-foreground mt-6">
              Esqueceu sua senha?{" "}
              <span className="text-primary font-medium cursor-pointer hover:underline">Recuperar</span>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Login;
