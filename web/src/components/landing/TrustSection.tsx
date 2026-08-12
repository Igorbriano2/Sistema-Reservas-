import { Reveal } from "./Fx.js";

// Isolado de proposito (pedido explicito): quando existirem depoimentos reais de
// clientes pagantes, esta secao inteira deve ser substituida por eles - nunca antes
// disso. Nenhum numero/estatistica/depoimento e inventado aqui.
export function TrustSection() {
  return (
    <section className="lp-secao lp-confianca">
      <div className="lp-container" style={{ maxWidth: 720, textAlign: "center", margin: "0 auto" }}>
        <Reveal as="span" className="lp-eyebrow">
          Por que confiar
        </Reveal>
        <Reveal delay={60} as="h2">
          Não vendemos isso porque lemos sobre o problema.{" "}
          <span className="lp-italico-destaque">Vendemos porque vivemos ele.</span>
        </Reveal>
        <Reveal delay={120} as="p" className="lp-texto-grande" style={{ margin: "1.25rem auto 0" }}>
          O Quero Reservar nasceu de um problema real, dentro de um restaurante de verdade — não de uma planilha de
          mercado. Cada decisão do produto (o link em vez de reserva automática por chat, o painel simples, o agente
          treinado pro seu negócio) veio de testar com um restaurante de verdade primeiro, não de uma lista de
          funcionalidades genéricas.
        </Reveal>
      </div>
    </section>
  );
}
