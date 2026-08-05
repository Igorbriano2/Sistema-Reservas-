import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";

export function Layout() {
  const { usuario, unidade, unidades, selecionarUnidade, logout } = useAuth();

  return (
    <div className="layout">
      <header className="topo">
        <nav>
          <strong>{unidade?.nome ?? "Reservas"}</strong>
          <NavLink to="/reservas" className={({ isActive }) => (isActive ? "ativo" : "")}>
            Reservas do dia
          </NavLink>
          <NavLink to="/mesas" className={({ isActive }) => (isActive ? "ativo" : "")}>
            Mesas
          </NavLink>
        </nav>
        <nav>
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
          <span>{usuario?.nome}</span>
          <button className="btn btn-secundario" onClick={logout}>
            Sair
          </button>
        </nav>
      </header>
      <main className="conteudo">
        <Outlet />
      </main>
    </div>
  );
}
