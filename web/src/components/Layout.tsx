import { useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import { useBarraLateralRecolhida } from "../lib/useBarraLateralRecolhida.js";
import { useEhMobile } from "../lib/useEhMobile.js";
import { obterPainelModo } from "../lib/escolhaPainel.js";
import type { Permissao } from "../types.js";
import { Marca } from "./Marca.js";
import { ThemeToggle } from "./ThemeToggle.js";
import { NotificacaoToggle } from "./NotificacaoToggle.js";
import { InstalarAppButton } from "./InstalarAppButton.js";

interface ItemDeNav {
  to: string;
  label: string;
  // Sem nenhum dos dois: liberado pra qualquer papel (baseline). ownerOnly: so o
  // dono (nao faz parte do checklist de funcionalidades extra, ex: Dashboard).
  // permissao: gerente/funcionario tambem acessam se tiverem essa funcionalidade
  // marcada (doc 17) - "unidade" confere na loja selecionada, "empresa" em qualquer
  // loja com acesso.
  ownerOnly?: boolean;
  permissao?: { valor: Permissao; escopo: "unidade" | "empresa" };
  icone: ReactNode;
  // Visivel no "Painel Operacao" (escolha pos-login estilo GetIn - Part A). Quem
  // nao marcar so aparece no "Painel Gestao".
  operacao?: boolean;
}

// Grupo de itens com submenu (Part B, ex: Reservas > Reservas/Fila de espera/Mesas).
interface GrupoDeNav {
  chave: string;
  label: string;
  icone: ReactNode;
  itens: ItemDeNav[];
}

type EntradaDeNav = ItemDeNav | GrupoDeNav;

function ehGrupo(entrada: EntradaDeNav): entrada is GrupoDeNav {
  return "itens" in entrada;
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

function IconeConversas() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
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

function IconeUnidades() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21V9l8-5 8 5v12" />
      <path d="M9 21v-6h6v6M4 9h16" />
    </svg>
  );
}

function IconeFilaEspera() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="3" />
      <path d="M2.5 20c0-2.8 2.5-5 5.5-5s5.5 2.2 5.5 5" />
      <path d="M16 4.5l2 2 3.5-3.5" />
    </svg>
  );
}

function IconeHorarios() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 9v4l2.5 2M9 2.5h6" />
    </svg>
  );
}

function IconeCardapio() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3v18M6 3c-1.5 0-2.5 1.5-2.5 4s1 4 2.5 4M6 3v7" />
      <path d="M18 3v18M18 3a3 3 0 0 0-3 3v4a3 3 0 0 0 3 3" />
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

// Menu organizado em grupos com submenu (Part B) - ex: "Reservas" reune Reservas do
// dia, Fila de espera e o Salao/Mesas. "operacao: true" marca o que aparece tambem
// no Painel Operacao (Part A) - quem nao marcar so aparece no Painel Gestao.
const NAV: EntradaDeNav[] = [
  { to: "/admin/dashboard", label: "Dashboard", ownerOnly: true, icone: <IconeDashboard /> },
  {
    chave: "reservas",
    label: "Reservas",
    icone: <IconeReservas />,
    itens: [
      { to: "/admin/reservas", label: "Reservas", icone: <IconeReservas />, operacao: true },
      { to: "/admin/fila-espera", label: "Fila de espera", icone: <IconeFilaEspera />, operacao: true },
      { to: "/admin/mesas", label: "Salão / Mesas", permissao: { valor: "editar_salao", escopo: "unidade" }, icone: <IconeMesas />, operacao: true },
      { to: "/admin/bloqueios", label: "Bloqueios", permissao: { valor: "editar_salao", escopo: "unidade" }, icone: <IconeBloqueios /> },
    ],
  },
  { to: "/admin/whatsapp", label: "WhatsApp", icone: <IconeWhatsapp /> },
  {
    chave: "configuracoes",
    label: "Configurações",
    icone: <IconeHorarios />,
    itens: [
      { to: "/admin/horarios", label: "Horários", permissao: { valor: "editar_salao", escopo: "unidade" }, icone: <IconeHorarios /> },
      { to: "/admin/cardapio", label: "Cardápio", permissao: { valor: "editar_cardapio", escopo: "unidade" }, icone: <IconeCardapio /> },
    ],
  },
  { to: "/admin/relatorios", label: "Relatórios", permissao: { valor: "ver_relatorios", escopo: "unidade" }, icone: <IconeRelatorios /> },
  { to: "/admin/agente", label: "Agente de IA", permissao: { valor: "editar_agente", escopo: "empresa" }, icone: <IconeAgente /> },
  { to: "/admin/conversas", label: "Conversas", ownerOnly: true, icone: <IconeConversas /> },
  { to: "/admin/usuarios", label: "Usuarios", permissao: { valor: "criar_usuarios", escopo: "empresa" }, icone: <IconeUsuarios /> },
  { to: "/admin/unidades", label: "Unidades", ownerOnly: true, icone: <IconeUnidades /> },
];

const GRUPOS_ABERTOS_KEY = "nav_grupos_abertos";

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
  const { usuario, unidade, unidades, isOwner, selecionarUnidade, logout, assinaturaComAviso, temPermissaoNaUnidade, temPermissaoNaEmpresa } =
    useAuth();
  const emModoTeste = localStorage.getItem(MODO_TESTE_ATIVO_KEY) === "true";
  const [recolhida, setRecolhida] = useBarraLateralRecolhida();
  const [painelModo] = useState(() => obterPainelModo());
  const ehMobile = useEhMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const [gruposAbertos, setGruposAbertos] = useState<Set<string>>(() => {
    const salvo = localStorage.getItem(GRUPOS_ABERTOS_KEY);
    const iniciais = new Set<string>(salvo ? (JSON.parse(salvo) as string[]) : []);
    for (const entrada of NAV) {
      if (ehGrupo(entrada) && entrada.itens.some((i) => location.pathname.startsWith(i.to))) {
        iniciais.add(entrada.chave);
      }
    }
    return iniciais;
  });

  function alternarGrupo(chave: string) {
    setGruposAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      localStorage.setItem(GRUPOS_ABERTOS_KEY, JSON.stringify([...novo]));
      return novo;
    });
  }

  function itemVisivel(item: ItemDeNav): boolean {
    if (painelModo === "operacao" && !item.operacao) return false;
    if (item.ownerOnly) return isOwner;
    if (item.permissao) {
      return item.permissao.escopo === "unidade" ? temPermissaoNaUnidade(item.permissao.valor) : temPermissaoNaEmpresa(item.permissao.valor);
    }
    return true;
  }

  function renderLink(item: ItemDeNav) {
    return (
      <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "ativo" : "")} title={recolhida ? item.label : undefined}>
        {item.icone}
        <span className="rotulo-nav">{item.label}</span>
      </NavLink>
    );
  }

  return (
    <div className="layout">
      <aside className={`barra-lateral ${recolhida ? "recolhida" : ""}`}>
        <Marca />
        <nav>
          {NAV.map((entrada) => {
            if (!ehGrupo(entrada)) {
              return itemVisivel(entrada) ? renderLink(entrada) : null;
            }
            const itensVisiveis = entrada.itens.filter(itemVisivel);
            if (itensVisiveis.length === 0) return null;
            // No mobile a barra vira abas fixas embaixo (doc 15) - grupos expansiveis
            // nao cabem nesse formato, entao achata: os itens do grupo aparecem soltos.
            if (ehMobile) return itensVisiveis.map(renderLink);
            const aberto = gruposAbertos.has(entrada.chave);
            const grupoAtivo = itensVisiveis.some((i) => location.pathname.startsWith(i.to));
            return (
              <div className="grupo-nav" key={entrada.chave}>
                <button
                  type="button"
                  className={`grupo-nav-cabecalho ${grupoAtivo ? "ativo" : ""}`}
                  onClick={() => alternarGrupo(entrada.chave)}
                  title={recolhida ? entrada.label : undefined}
                >
                  {entrada.icone}
                  <span className="rotulo-nav">{entrada.label}</span>
                  <span className={`icone-chevron grupo-nav-chevron ${aberto ? "" : "fechado"}`}>
                    <IconeChevron />
                  </span>
                </button>
                {aberto && <div className="subnav">{itensVisiveis.map(renderLink)}</div>}
              </div>
            );
          })}
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
          {unidades.length > 1 ? (
            <select
              className="seletor-unidade"
              aria-label="Unidade"
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
          ) : (
            <span className="texto-secundario">{unidade?.nome ?? ""}</span>
          )}
          <button type="button" className="link-trocar-painel" onClick={() => navigate("/admin/escolher-painel")}>
            {painelModo === "operacao" ? "Painel Operação" : "Painel Gestão"} · trocar
          </button>
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
