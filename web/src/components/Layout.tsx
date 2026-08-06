import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import { Marca } from "./Marca.js";

interface ItemDeNav {
  to: string;
  label: string;
  ownerOnly?: boolean;
  icone: ReactNode;
}

function IconeDashboard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 20V10M12 20V4M20 20v-7" />
    </svg>
  );
}

function IconeReservas() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </svg>
  );
}

function IconeMesas() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="1.5" />
    </svg>
  );
}

function IconeBloqueios() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="10.5" width="14" height="9" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </svg>
  );
}

function IconeRelatorios() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5V12l6 3.5" />
    </svg>
  );
}

function IconeAgente() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M4 5.5h16v10H9l-4 3.5v-3.5H4z" />
    </svg>
  );
}

function IconeUsuarios() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.2c1.7.4 3 2 3 3.8s-1.3 3.4-3 3.8M22 20c0-2.8-1.9-5.1-4.5-5.8" />
    </svg>
  );
}

const ITENS_NAV: ItemDeNav[] = [
  { to: "/admin/dashboard", label: "Dashboard", ownerOnly: true, icone: <IconeDashboard /> },
  { to: "/admin/reservas", label: "Reservas", icone: <IconeReservas /> },
  { to: "/admin/mesas", label: "Mesas", ownerOnly: true, icone: <IconeMesas /> },
  { to: "/admin/bloqueios", label: "Bloqueios", ownerOnly: true, icone: <IconeBloqueios /> },
  { to: "/admin/relatorios", label: "Relatórios", ownerOnly: true, icone: <IconeRelatorios /> },
  { to: "/admin/agente", label: "Agente de IA", ownerOnly: true, icone: <IconeAgente /> },
  { to: "/admin/usuarios", label: "Usuarios", ownerOnly: true, icone: <IconeUsuarios /> },
];

export function Layout() {
  const { usuario, unidade, unidades, isOwner, selecionarUnidade, logout } = useAuth();

  return (
    <div className="layout">
      <aside className="barra-lateral">
        <Marca />
        <nav>
          {ITENS_NAV.filter((item) => !item.ownerOnly || isOwner).map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "ativo" : "")}>
              {item.icone}
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="area-principal">
        <header className="topo">
          <span className="texto-secundario">{unidade?.nome ?? ""}</span>
          {unidades.length > 1 && (
            <select
              value={unidade?.id ?? ""}
              onChange={(e) => {
                const selecionada = unidades.find((u) => u.id === e.target.value);
                if (selecionada) selecionarUnidade(selecionada);
              }}
            >
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          )}
          <span style={{ flex: 1 }} />
          <span>{usuario?.nome}</span>
          <button className="btn btn-secundario" onClick={logout}>
            Sair
          </button>
        </header>
        <main className="conteudo">
          <Outlet />
        </main>
        <footer className="rodape">
          <Marca />
          <div>Painel administrativo</div>
        </footer>
      </div>
    </div>
  );
}
