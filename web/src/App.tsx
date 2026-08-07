import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.js";
import { Layout } from "./components/Layout.js";
import { LandingPage } from "./pages/LandingPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { ReservationsPage } from "./pages/ReservationsPage.js";
import { TablesPage } from "./pages/TablesPage.js";
import { BlocksPage } from "./pages/BlocksPage.js";
import { ReportsPage } from "./pages/ReportsPage.js";
import { UsersPage } from "./pages/UsersPage.js";
import { AgentConfigPage } from "./pages/AgentConfigPage.js";
import { WhatsAppPage } from "./pages/WhatsAppPage.js";
import { PublicReservationPage } from "./pages/PublicReservationPage.js";
import { CheckoutPage } from "./pages/CheckoutPage.js";
import { AssinaturaBloqueadaPage } from "./pages/AssinaturaBloqueadaPage.js";
import { PlataformaAuthProvider, usePlataformaAuth } from "./plataforma/PlataformaAuthContext.js";
import { PlataformaLoginPage } from "./plataforma/PlataformaLoginPage.js";
import { PlataformaLayout } from "./plataforma/PlataformaLayout.js";
import { ClientesPage } from "./plataforma/ClientesPage.js";
import { LeadsPage } from "./plataforma/LeadsPage.js";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { usuario, carregando, assinaturaBloqueada } = useAuth();

  if (carregando) {
    return <p style={{ padding: "2rem" }}>Carregando...</p>;
  }
  if (!usuario) {
    return <Navigate to="/admin/login" replace />;
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

function RequirePlataformaAuth({ children }: { children: React.ReactNode }) {
  const { admin } = usePlataformaAuth();
  if (!admin) {
    return <Navigate to="/painel/login" replace />;
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
      <Route path="/admin/login" element={<LoginPage />} />
      <Route path="/reservar/:token" element={<PublicReservationPage />} />
      <Route path="/assinar" element={<CheckoutPage />} />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <Layout />
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
        <Route path="whatsapp" element={<WhatsAppPage />} />
        <Route
          path="mesas"
          element={
            <RequireOwner>
              <TablesPage />
            </RequireOwner>
          }
        />
        <Route
          path="bloqueios"
          element={
            <RequireOwner>
              <BlocksPage />
            </RequireOwner>
          }
        />
        <Route
          path="relatorios"
          element={
            <RequireOwner>
              <ReportsPage />
            </RequireOwner>
          }
        />
        <Route
          path="agente"
          element={
            <RequireOwner>
              <AgentConfigPage />
            </RequireOwner>
          }
        />
        <Route
          path="usuarios"
          element={
            <RequireOwner>
              <UsersPage />
            </RequireOwner>
          }
        />
      </Route>
      <Route path="/painel/login" element={<PlataformaLoginPage />} />
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
      </Route>
      <Route path="*" element={<Navigate to={destinoDaRaiz()} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PlataformaAuthProvider>
          <AppRoutes />
        </PlataformaAuthProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
