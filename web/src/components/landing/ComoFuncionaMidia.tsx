interface ComoFuncionaMidiaProps {
  passoAtivo: number;
}

// Ilustracao CSS/SVG do fluxo (mensagem -> resposta do agente -> link -> confirmacao).
// Isolado de proposito: pra trocar por um video real depois, basta substituir o
// conteudo deste componente - a secao "Como funciona" nao precisa mudar.
export function ComoFuncionaMidia({ passoAtivo }: ComoFuncionaMidiaProps) {
  return (
    <div className="cf-midia" aria-hidden="true">
      <div className="cf-tela">
        <div className="cf-topo-tela">
          <span className="cf-ponto" />
          <span className="cf-ponto" />
          <span className="cf-ponto" />
          <span className="cf-titulo-tela">Instagram Direct</span>
        </div>
        <div className="cf-bolhas">
          <div className={`cf-bolha cf-bolha-cliente ${passoAtivo >= 0 ? "visivel" : ""}`}>
            Oi, tem mesa pra 4 sexta às 20h?
          </div>
          <div className={`cf-bolha cf-bolha-agente ${passoAtivo >= 1 ? "visivel" : ""}`}>
            Vamos ver! Aqui está o link pra você confirmar:
            <span className="cf-link">quero-reservar.app/r/8x2f</span>
          </div>
          <div className={`cf-bolha cf-bolha-confirmacao ${passoAtivo >= 2 ? "visivel" : ""}`}>
            <span className="cf-etiqueta-mini" />
            Reserva confirmada — sexta, 20h, 4 pessoas.
          </div>
        </div>
      </div>
    </div>
  );
}
