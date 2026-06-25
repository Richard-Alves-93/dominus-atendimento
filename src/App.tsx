import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { CompanyProvider } from "@/contexts/CompanyContext";
import { PublicRoute, ProtectedRoute, MasterRoute } from "@/components/guards/RouteGuards";

import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Cadastro from "./pages/Cadastro";
import SelecionarEmpresa from "./pages/SelecionarEmpresa";
import Dashboard from "./pages/Dashboard";
import Tickets from "./pages/Tickets";
import Contacts from "./pages/Contacts";
import Conexoes from "./pages/Conexoes";
import Setores from "./pages/Setores";
import Equipe from "./pages/Equipe";
import TrocarSenha from "./pages/TrocarSenha";
import Placeholder from "./pages/Placeholder";
import Configuracoes from "./pages/Configuracoes";
import Perfil from "./pages/Perfil";
import Agendamentos from "./pages/Agendamentos";
import MensagensRapidas from "./pages/MensagensRapidas";
import Oportunidades from "./pages/Oportunidades";
import Comissoes from "./pages/Comissoes";
import MasterDashboard from "./pages/master/MasterDashboard";
import MasterEmpresas from "./pages/master/MasterEmpresas";
import MasterPlaceholder from "./pages/master/MasterPlaceholder";
import MasterMonitoramento from "./pages/master/MasterMonitoramento";
import EmpresaBloqueada from "./pages/EmpresaBloqueada";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <CompanyProvider>
            <Routes>
              <Route path="/" element={<PublicRoute><Landing /></PublicRoute>} />
              <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
              <Route path="/cadastro" element={<PublicRoute><Cadastro /></PublicRoute>} />
              <Route path="/selecionar-empresa" element={<SelecionarEmpresa />} />
              <Route path="/empresa-bloqueada" element={<EmpresaBloqueada />} />
              <Route path="/trocar-senha" element={<TrocarSenha />} />


              <Route path="/app" element={<ProtectedRoute><Navigate to="/app/dashboard" replace /></ProtectedRoute>} />
              <Route path="/app/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/app/tickets" element={<ProtectedRoute><Tickets /></ProtectedRoute>} />
              <Route path="/app/contatos" element={<ProtectedRoute><Contacts /></ProtectedRoute>} />
              <Route path="/app/campanhas" element={<ProtectedRoute><Placeholder title="Campanhas" description="Disparos em massa e prospecção." /></ProtectedRoute>} />
              <Route path="/app/agendamentos" element={<ProtectedRoute><Agendamentos /></ProtectedRoute>} />
              <Route path="/app/oportunidades" element={<ProtectedRoute><Oportunidades /></ProtectedRoute>} />
              <Route path="/app/mensagens-rapidas" element={<ProtectedRoute><MensagensRapidas /></ProtectedRoute>} />
              <Route path="/app/conexoes" element={<ProtectedRoute><Conexoes /></ProtectedRoute>} />
              <Route path="/app/setores" element={<ProtectedRoute><Setores /></ProtectedRoute>} />
              <Route path="/app/equipe" element={<ProtectedRoute><Equipe /></ProtectedRoute>} />
              <Route path="/app/tags" element={<ProtectedRoute><Placeholder title="Tags" description="Classifique contatos e tickets." /></ProtectedRoute>} />
              <Route path="/app/configuracoes" element={<ProtectedRoute><Configuracoes /></ProtectedRoute>} />
              <Route path="/app/perfil" element={<ProtectedRoute><Perfil /></ProtectedRoute>} />

              <Route path="/master" element={<MasterRoute><MasterDashboard /></MasterRoute>} />
              <Route path="/master/empresas" element={<MasterRoute><MasterEmpresas /></MasterRoute>} />
              <Route path="/master/planos" element={<MasterRoute><MasterPlaceholder title="Planos" /></MasterRoute>} />
              <Route path="/master/canais" element={<MasterRoute><MasterPlaceholder title="Canais" /></MasterRoute>} />
              <Route path="/master/monitoramento" element={<MasterRoute><MasterMonitoramento /></MasterRoute>} />
              <Route path="/master/logs" element={<MasterRoute><MasterPlaceholder title="Logs" /></MasterRoute>} />
              <Route path="/master/configuracoes" element={<MasterRoute><MasterPlaceholder title="Configurações" /></MasterRoute>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </CompanyProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
