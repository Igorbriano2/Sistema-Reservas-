import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import { Marca } from "../components/Marca.js";
import { definirPainelModo, marcarFluxoCompleto, type PainelModo } from "../lib/escolhaPainel.js";

function IconeGestao() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V10M12 20V4M20 20v-7" />
    </svg>
  );
}

function IconeOperacao() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </svg>
  );
}

// Tela pos-login "Escolha qual painel voce quer usar" (espelha o fluxo do GetIn) -
// Painel Gestao da acesso a tudo (dashboard, config, relatorios); Painel Operacao
// e um atalho pra quem so cuida do dia a dia de reservas (ex: recepcao), sem
// afetar as permissoes reais - so filtra o que aparece no menu (Layout.tsx).
export function EscolherPainelPage() {
  const { unidades } = useAuth();
  const navigate = useNavigate();

  function escolher(modo: PainelModo) {
    definirPainelModo(modo);
    if (unidades.length > 1) {
      navigate("/admin/escolher-loja");
    } else {
      marcarFluxoCompleto();
      navigate("/admin/reservas");
    }
  }

  return (
    <div className="tela-login">
      <div className="escolha-painel">
        <Marca tamanho="grande" />
        <h1>Escolha qual painel você quer usar</h1>
        <div className="cartoes-escolha">
          <button type="button" className="cartao-escolha" onClick={() => escolher("gestao")}>
            <IconeGestao />
            <strong>Painel Gestão</strong>
            <span>Dashboard e todas as funcionalidades</span>
          </button>
          <button type="button" className="cartao-escolha" onClick={() => escolher("operacao")}>
            <IconeOperacao />
            <strong>Painel Operação</strong>
            <span>Ver e gerenciar reservas</span>
          </button>
        </div>
      </div>
    </div>
  );
}
