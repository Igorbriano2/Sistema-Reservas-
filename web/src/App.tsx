import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.js";
import type { Permissao } from "./types.js";
import { AmbientParticles } from "./components/AmbientParticles.js";
import { Layout } from "./components/Layout.js";
import { LandingPage } from "./pages/LandingPage.js";
import { ApresentacaoPage } from "./pages/ApresentacaoPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { EscolherPainelPage } from "./pages/EscolherPainelPage.js";
import { EscolherLojaPage } from "./pages/EscolherLojaPage.js";
import { fluxoEscolhaCompleto } from "./lib/escolhaPainel.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { ReservationsPage } from "./pages/ReservationsPage.js";
import { TablesPage } from "./pages/TablesPage.js";
import { BlocksPage } from "./pages/BlocksPage.js";
import { ReportsPage } from "./pages/ReportsPage.js";
import { UsersPage } from "./pages/UsersPage.js";
import { UnidadesPage } from "./pages/UnidadesPage.js";
import { MenuPage } from "./pages/MenuPage.js";
import { SchedulePage } from "./pages/SchedulePage.js";
import { WaitingListPage } from "./pages/WaitingListPage.js";
import { AgentConfigPage } from "./pages/AgentConfigPage.js";
import { CampanhasPage } from "./pages/CampanhasPage.js";
import { ConversasPage } from "./pages/ConversasPage.js";
import { FeedbackPage } from "./pages/FeedbackPage.js";
import { WhatsAppPage } from "./pages/WhatsAppPage.js";
import { PublicReservationPage } from "./pages/PublicReservationPage.js";
import { PublicMenuPage } from "./pages/PublicMenuPage.js";
import { WidgetReservationPage } from "./pages/WidgetReservationPage.js";
import { PublicSurveyPage } from "./pages/PublicSurveyPage.js";
import { CheckoutPage } from "./pages/CheckoutPage.js";
import { AssinaturaBloqueadaPage } from "./pages/AssinaturaBloqueadaPage.js";
import { PlataformaAuthProvider, usePlataformaAuth } from "./plataforma/PlataformaAuthContext.js";
import { PlataformaLoginPage } from "./plataforma/PlataformaLoginPage.js";
import { PlataformaLayout } from "./plataforma/PlataformaLayout.js";
import { ClientesPage } from "./plataforma/ClientesPage.js";
import { LeadsPage } from "./plataforma/LeadsPage.js";
import { AdminsPage } from "./plataforma/AdminsPage.js";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { usuario, carregando, assinaturaBloqueada } = useAuth();

  if (carregando) {
    return <p style={{ padding: "2rem" }}>Carregando...</p>;
  }
  if (!usuario) {
    return <Navigate to="/login" replace />;
  }
  // Continua autenticado (nao e um 401), so a assinatura da empresa nao esta em dia -
  // mostra a tela de bloqueio no lugar do painel, mas sem derrubar a sessao.
  if (assinaturaBloqueada) {
    return <AssinaturaBloqueadaPage />;
  }
  return <>{children}</>;
}

// Bloqueia navegacao direta (por URL) a telas de owner mesmo que o nav esteja
// escondido para funcionario - a checagem real ainda e sempre no backend (403).
function RequireOwner({ children }: { children: React.ReactNode }) {
  const { isOwner } = useAuth();
  if (!isOwner) {
    return <Navigate to="/admin/reservas" replace />;
  }
  return <>{children}</>;
}

// Mesma ideia, mas pra telas que gerente/funcionario tambem podem acessar quando o
// dono marcou a funcionalidade extra correspondente na hora de criar o login (doc 17).
function RequirePermissaoNaUnidade({ permissao, children }: { permissao: Permissao; children: React.ReactNode }) {
  const { temPermissaoNaUnidade } = useAuth();
  if (!temPermissaoNaUnidade(permissao)) {
    return <Navigate to="/admin/reservas" replace />;
  }
  return <>{children}</>;
}

function RequirePermissaoNaEmpresa({ permissao, children }: { permissao: Permissao; children: React.ReactNode }) {
  const { temPermissaoNaEmpresa } = useAuth();
  if (!temPermissaoNaEmpresa(permissao)) {
    return <Navigate to="/admin/reservas" replace />;
  }
  return <>{children}</>;
}

// Ganha do GetIn: depois do login, o usuario passa por "escolher painel" (e "escolher
// loja", se tiver mais de uma) antes de cair no painel de verdade - RequireAuth ja
// garante usuario logado, esse guard so garante que o fluxo foi concluido nesta aba.
function RequirePainelEscolhido({ children }: { children: React.ReactNode }) {
  if (!fluxoEscolhaCompleto()) {
    return <Navigate to="/admin/escolher-painel" replace />;
  }
  return <>{children}</>;
}

function RequirePlataformaAuth({ children }: { children: React.ReactNode }) {
  const { admin } = usePlataformaAuth();
  if (!admin) {
    return <Navigate to="/briano" replace />;
  }
  return <>{children}</>;
}

// Se o site for acessado por um subdominio dedicado ao painel da plataforma (ex:
// painel.queroreservar.com), a raiz "/" desse dominio deve cair direto no painel em
// vez da landing page - mesmo build/deploy, so muda o que a raiz do dominio mostra.
function destinoDaRaiz(): string {
  return window.location.hostname.startsWith("painel.") ? "/painel" : "/";
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={window.location.hostname.startsWith("painel.") ? <Navigate to="/painel" replace /> : <LandingPage />} />
      <Route path="/apresentacao" element={<ApresentacaoPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/admin/escolher-painel"
        element={
          <RequireAuth>
            <EscolherPainelPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/escolher-loja"
        element={
          <RequireAuth>
            <EscolherLojaPage />
          </RequireAuth>
        }
      />
      <Route path="/reservar/:token" element={<PublicReservationPage />} />
      <Route path="/cardapio/:unidadeId" element={<PublicMenuPage />} />
      <Route path="/widget/:unidadeId" element={<WidgetReservationPage />} />
      <Route path="/pesquisa/:token" element={<PublicSurveyPage />} />
      <Route path="/assinar" element={<CheckoutPage />} />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <RequirePainelEscolhido>
              <Layout />
            </RequirePainelEscolhido>
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/admin/reservas" replace />} />
        <Route
          path="dashboard"
          element={
            <RequireOwner>
              <DashboardPage />
            </RequireOwner>
          }
        />
        <Route path="reservas" element={<ReservationsPage />} />
        <Route path="fila-espera" element={<WaitingListPage />} />
        <Route path="whatsapp" element={<WhatsAppPage />} />
        <Route
          path="mesas"
          element={
            <RequirePermissaoNaUnidade permissao="editar_salao">
              <TablesPage />
            </RequirePermissaoNaUnidade>
          }
        />
        <Route
          path="bloqueios"
          element={
            <RequirePermissaoNaUnidade permissao="editar_salao">
              <BlocksPage />
            </RequirePermissaoNaUnidade>
          }
        />
        <Route
          path="horarios"
          element={
            <RequirePermissaoNaUnidade permissao="editar_salao">
              <SchedulePage />
            </RequirePermissaoNaUnidade>
          }
        />
        <Route
          path="cardapio"
          element={
            <RequirePermissaoNaUnidade permissao="editar_cardapio">
              <MenuPage />
            </RequirePermissaoNaUnidade>
          }
        />
        <Route
          path="relatorios"
          element={
            <RequirePermissaoNaUnidade permissao="ver_relatorios">
              <ReportsPage />
            </RequirePermissaoNaUnidade>
          }
        />
        <Route
          path="feedback"
          element={
            <RequirePermissaoNaUnidade permissao="ver_relatorios">
              <FeedbackPage />
            </RequirePermissaoNaUnidade>
          }
        />
        <Route
          path="agente"
          element={
            <RequirePermissaoNaEmpresa permissao="editar_agente">
              <AgentConfigPage />
            </RequirePermissaoNaEmpresa>
          }
        />
        {/* Item 02 - qualquer papel com acesso a unidade ve/responde (o backend so exige
            requireAcessoUnidade); a conexao do Instagram em si continua owner-only
            dentro da propria ConversasPage. */}
        <Route path="conversas" element={<ConversasPage />} />
        <Route
          path="campanhas"
          element={
            <RequireOwner>
              <CampanhasPage />
            </RequireOwner>
          }
        />
        <Route
          path="usuarios"
          element={
            <RequirePermissaoNaEmpresa permissao="criar_usuarios">
              <UsersPage />
            </RequirePermissaoNaEmpresa>
          }
        />
        <Route
          path="unidades"
          element={
            <RequireOwner>
              <UnidadesPage />
            </RequireOwner>
          }
        />
      </Route>
      <Route path="/briano" element={<PlataformaLoginPage />} />
      <Route
        path="/painel"
        element={
          <RequirePlataformaAuth>
            <PlataformaLayout />
          </RequirePlataformaAuth>
        }
      >
        <Route index element={<Navigate to="/painel/clientes" replace />} />
        <Route path="clientes" element={<ClientesPage />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="admins" element={<AdminsPage />} />
      </Route>
      <Route path="*" element={<Navigate to={destinoDaRaiz()} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      {/* Puramente decorativo (redesign Apple-style/Liquid Glass) - fixo atras de tudo,
          cobre o app inteiro de uma vez so, sem nenhum estado/logica propria. */}
      <AmbientParticles />
      <AuthProvider>
        <PlataformaAuthProvider>
          <AppRoutes />
        </PlataformaAuthProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
