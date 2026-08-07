import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import { Marca } from "../components/Marca.js";
import type { Unidade } from "../types.js";
import { marcarFluxoCompleto } from "../lib/escolhaPainel.js";

function IconeLoja() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21V9l8-5 8 5v12" />
      <path d="M9 21v-6h6v6M4 9h16" />
    </svg>
  );
}

// Tela "Unidades" do GetIn - grade de lojas pra escolher qual operar, em vez do
// dropdown discreto que ja existia no cabecalho (Layout.tsx segue mostrando o
// dropdown tambem, pra trocar de loja sem passar por aqui de novo).
export function EscolherLojaPage() {
  const { unidades, selecionarUnidade } = useAuth();
  const navigate = useNavigate();

  function escolher(unidade: Unidade) {
    selecionarUnidade(unidade);
    marcarFluxoCompleto();
    navigate("/admin/reservas");
  }

  return (
    <div className="tela-login">
      <div className="escolha-painel escolha-painel-lojas">
        <Marca tamanho="grande" />
        <h1>Escolha a loja</h1>
        <div className="grade-lojas">
          {unidades.map((unidade) => (
            <button type="button" key={unidade.id} className="cartao-loja" onClick={() => escolher(unidade)}>
              <IconeLoja />
              <strong>{unidade.nome}</strong>
              {unidade.endereco && <span>{unidade.endereco}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
