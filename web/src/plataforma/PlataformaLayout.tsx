import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { usePlataformaAuth } from "./PlataformaAuthContext.js";
import { entrarEmModoTeste } from "./resources.js";
import { ApiError } from "../api/client.js";
import { Marca } from "../components/Marca.js";
import { ThemeToggle } from "../components/ThemeToggle.js";

function IconeClientes() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="4.5" width="17" height="12" rx="2" />
      <path d="M3.5 9.5h17M8 20h8" />
    </svg>
  );
}

function IconeLeads() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4.5h16v11H9l-4 4v-4H4z" />
      <path d="M8.5 9h7" />
    </svg>
  );
}

// Entra em "modo teste": pega um token de sessao normal de uma empresa demo (a
// mesma sempre) e grava nas MESMAS chaves de localStorage que o AuthContext do
// painel do restaurante le ("token"/"usuario") - alem de uma flag propria pra esse
// painel saber mostrar o aviso de "voce esta em modo teste" e o caminho de volta.
// O token da PLATAFORMA (chaves "plataforma_token"/"plataforma_admin") fica intacto.
async function iniciarModoTeste() {
  const { token, usuario } = await entrarEmModoTeste();
  localStorage.setItem("token", token);
  localStorage.setItem("usuario", JSON.stringify(usuario));
  localStorage.setItem("modo_teste_ativo", "true");
  window.location.href = "/admin/reservas";
}

export function PlataformaLayout() {
  const { admin, logout } = usePlataformaAuth();
  const [entrandoEmTeste, setEntrandoEmTeste] = useState(false);
  const [erroModoTeste, setErroModoTeste] = useState<string | null>(null);

  async function handleModoTeste() {
    setEntrandoEmTeste(true);
    setErroModoTeste(null);
    try {
      await iniciarModoTeste();
    } catch (err) {
      setErroModoTeste(err instanceof ApiError ? err.message : "Nao foi possivel entrar em modo teste.");
      setEntrandoEmTeste(false);
    }
  }

  return (
    <div className="layout">
      <aside className="barra-lateral">
        <Marca />
        <nav>
          <NavLink to="/painel/clientes" className={({ isActive }) => (isActive ? "ativo" : "")}>
            <IconeClientes />
            Clientes
          </NavLink>
          <NavLink to="/painel/leads" className={({ isActive }) => (isActive ? "ativo" : "")}>
            <IconeLeads />
            Lista de espera
          </NavLink>
        </nav>
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <button className="btn btn-secundario" onClick={handleModoTeste} disabled={entrandoEmTeste}>
            {entrandoEmTeste ? "Entrando..." : "Ver como restaurante"}
          </button>
          {erroModoTeste && (
            <span className="erro" style={{ fontSize: "0.78rem" }}>
              {erroModoTeste}
            </span>
          )}
        </div>
      </aside>
      <div className="area-principal">
        <header className="topo">
          <span className="texto-secundario">Painel da plataforma</span>
          <span style={{ flex: 1 }} />
          <ThemeToggle />
          <span>{admin?.nome}</span>
          <button className="btn btn-secundario" onClick={logout}>
            Sair
          </button>
        </header>
        <main className="conteudo">
          <Outlet />
        </main>
        <footer className="rodape">
          <Marca />
          <div>Painel da plataforma</div>
        </footer>
      </div>
    </div>
  );
}
