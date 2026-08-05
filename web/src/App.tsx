import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.js";
import { Layout } from "./components/Layout.js";
import { LoginPage } from "./pages/LoginPage.js";
import { ReservationsPage } from "./pages/ReservationsPage.js";
import { TablesPage } from "./pages/TablesPage.js";

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

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Navigate to="/reservas" replace />} />
        <Route path="/reservas" element={<ReservationsPage />} />
        <Route path="/mesas" element={<TablesPage />} />
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
