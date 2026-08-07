import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import { useBarraLateralRecolhida } from "../lib/useBarraLateralRecolhida.js";
import { Marca } from "./Marca.js";
import { ThemeToggle } from "./ThemeToggle.js";
import { NotificacaoToggle } from "./NotificacaoToggle.js";
import { InstalarAppButton } from "./InstalarAppButton.js";

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

function IconeWhatsapp() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20l1.3-3.9A8 8 0 1 1 8.9 19.7L4 20z" />
      <path d="M8.5 9.5c0 3.5 2.5 6 6 6" />
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

function IconeChevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

const ITENS_NAV: ItemDeNav[] = [
  { to: "/admin/dashboard", label: "Dashboard", ownerOnly: true, icone: <IconeDashboard /> },
  { to: "/admin/reservas", label: "Reservas", icone: <IconeReservas /> },
  { to: "/admin/whatsapp", label: "WhatsApp", icone: <IconeWhatsapp /> },
  { to: "/admin/mesas", label: "Mesas", ownerOnly: true, icone: <IconeMesas /> },
  { to: "/admin/bloqueios", label: "Bloqueios", ownerOnly: true, icone: <IconeBloqueios /> },
  { to: "/admin/relatorios", label: "Relatórios", ownerOnly: true, icone: <IconeRelatorios /> },
  { to: "/admin/agente", label: "Agente de IA", ownerOnly: true, icone: <IconeAgente /> },
  { to: "/admin/usuarios", label: "Usuarios", ownerOnly: true, icone: <IconeUsuarios /> },
];

const MODO_TESTE_ATIVO_KEY = "modo_teste_ativo";

// Sai do modo teste: limpa o token de restaurante (chaves "token"/"usuario", as
// mesmas que o AuthContext usa) e a flag, sem tocar no "plataforma_token" - a sessao
// do painel da plataforma continua valida do outro lado.
function sairDoModoTeste() {
  localStorage.removeItem("token");
  localStorage.removeItem("usuario");
  localStorage.removeItem(MODO_TESTE_ATIVO_KEY);
  window.location.href = "/painel/clientes";
}

export function Layout() {
  const { usuario, unidade, unidades, isOwner, selecionarUnidade, logout, assinaturaComAviso } = useAuth();
  const emModoTeste = localStorage.getItem(MODO_TESTE_ATIVO_KEY) === "true";
  const [recolhida, setRecolhida] = useBarraLateralRecolhida();

  return (
    <div className="layout">
      <aside className={`barra-lateral ${recolhida ? "recolhida" : ""}`}>
        <Marca />
        <nav>
          {ITENS_NAV.filter((item) => !item.ownerOnly || isOwner).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? "ativo" : "")}
              title={recolhida ? item.label : undefined}
            >
              {item.icone}
              <span className="rotulo-nav">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          className="btn btn-secundario barra-lateral-alternar"
          style={{ marginTop: "auto" }}
          onClick={() => setRecolhida((r) => !r)}
          aria-label={recolhida ? "Expandir menu" : "Recolher menu"}
          title={recolhida ? "Expandir menu" : "Recolher menu"}
        >
          <span className={`icone-chevron ${recolhida ? "invertido" : ""}`}>
            <IconeChevron />
          </span>
          <span className="rotulo-alternar">Recolher menu</span>
        </button>
      </aside>
      <div className="area-principal">
        {emModoTeste && (
          <div className="faixa-modo-teste">
            Modo teste — você está vendo o painel como um restaurante veria, com dados de demonstração.
            <button className="btn btn-secundario" onClick={sairDoModoTeste}>
              Voltar ao meu painel
            </button>
          </div>
        )}
        {assinaturaComAviso && (
          <div className="faixa-aviso-assinatura">
            O pagamento da sua assinatura está atrasado. Regularize para não perder o acesso ao painel.
          </div>
        )}
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
          <InstalarAppButton />
          {unidade && <NotificacaoToggle unidadeId={unidade.id} />}
          <ThemeToggle />
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
