import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.js";
import { Layout } from "./components/Layout.js";
import { LoginPage } from "./pages/LoginPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { ReservationsPage } from "./pages/ReservationsPage.js";
import { TablesPage } from "./pages/TablesPage.js";
import { UsersPage } from "./pages/UsersPage.js";
import { AgentConfigPage } from "./pages/AgentConfigPage.js";
import { PublicReservationPage } from "./pages/PublicReservationPage.js";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { usuario, carregando } = useAuth();

  if (carregando) {
    return <p style={{ padding: "2rem" }}>Carregando...</p>;
  }
  if (!usuario) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

// Bloqueia navegacao direta (por URL) a telas de owner mesmo que o nav esteja
// escondido para funcionario - a checagem real ainda e sempre no backend (403).
function RequireOwner({ children }: { children: React.ReactNode }) {
  const { isOwner } = useAuth();
  if (!isOwner) {
    return <Navigate to="/reservas" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reservar/:token" element={<PublicReservationPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Navigate to="/reservas" replace />} />
        <Route
          path="/dashboard"
          element={
            <RequireOwner>
              <DashboardPage />
            </RequireOwner>
          }
        />
        <Route path="/reservas" element={<ReservationsPage />} />
        <Route
          path="/mesas"
          element={
            <RequireOwner>
              <TablesPage />
            </RequireOwner>
          }
        />
        <Route
          path="/agente"
          element={
            <RequireOwner>
              <AgentConfigPage />
            </RequireOwner>
          }
        />
        <Route
          path="/usuarios"
          element={
            <RequireOwner>
              <UsersPage />
            </RequireOwner>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
