import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";

export function Layout() {
  const { usuario, unidade, unidades, isOwner, selecionarUnidade, logout } = useAuth();

  return (
    <div className="layout">
      <header className="topo">
        <nav>
          <span className="marca">
            Quero<span className="marca-ponto">Reservar</span>
          </span>
          <span className="texto-secundario">{unidade?.nome ?? ""}</span>
          <NavLink to="/reservas" className={({ isActive }) => (isActive ? "ativo" : "")}>
            Reservas do dia
          </NavLink>
          {isOwner && (
            <>
              <NavLink to="/mesas" className={({ isActive }) => (isActive ? "ativo" : "")}>
                Mesas
              </NavLink>
              <NavLink to="/agente" className={({ isActive }) => (isActive ? "ativo" : "")}>
                Agente de IA
              </NavLink>
              <NavLink to="/usuarios" className={({ isActive }) => (isActive ? "ativo" : "")}>
                Usuarios
              </NavLink>
            </>
          )}
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
      <footer className="rodape">
        <span className="marca">
          Quero<span className="marca-ponto">Reservar</span>
        </span>
        <div>Painel administrativo</div>
      </footer>
    </div>
  );
}
