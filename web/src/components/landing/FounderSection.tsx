import { Reveal, SpotCard, Aurora } from "./Fx.js";
import fotoPrincipal from "../../assets/founder/igor-portrait.jpg";
import fotoSentado from "../../assets/founder/igor-seated.jpg";
import fotoVermelha from "../../assets/founder/igor-red.jpg";

// Bio e dados reais fornecidos pelo fundador (Igor Briano) - nao inventar nem
// arredondar numeros aqui.
export function FounderSection() {
  return (
    <section className="lp-secao lp-secao-fundo-relativo" id="fundador">
      <Aurora />
      <div className="lp-container" style={{ maxWidth: 1040 }}>
        <Reveal as="h2">Quem está por trás do Quero Reservar</Reveal>
        <div className="lp-fundador" style={{ marginTop: "2.5rem", alignItems: "center" }}>
          <Reveal>
            <div className="lp-fundador-colagem" role="img" aria-label="Fotos de Igor Briano, fundador do Quero Reservar">
              <span className="lp-fundador-colagem-glow" aria-hidden="true" />
              <div className="lp-fundador-colagem-principal">
                <img src={fotoPrincipal} alt="Igor Briano, fundador do Quero Reservar" loading="lazy" />
              </div>
              <div className="lp-fundador-colagem-bloco lp-fundador-colagem-bloco-1">
                <img src={fotoSentado} alt="Igor Briano" loading="lazy" />
              </div>
              <div className="lp-fundador-colagem-bloco lp-fundador-colagem-bloco-2">
                <img src={fotoVermelha} alt="Igor Briano" loading="lazy" />
              </div>
            </div>
          </Reveal>
          <Reveal delay={120}>
          <SpotCard style={{ padding: "2rem" }}>
            <h3 style={{ marginTop: 0 }}>Igor Briano — Fundador</h3>
            <p className="lp-texto-grande">
              Igor Briano é empresário e estrategista de crescimento, com atuação forte em negócios locais e
              franquias de alimentação. Foi justamente na prática, dentro da operação de seus clientes, que nasceu a
              ideia do Quero Reservar.
            </p>
            <p>
              Ao liderar o crescimento de negócios como a Espetaria Cervegela — que saiu de R$90 mil para R$450 mil
              de faturamento mensal —, Igor percebeu um padrão que se repetia em praticamente todos os clientes que
              atendia: as campanhas de marketing traziam resultado, mas a operação não acompanhava. Não bastava gerar
              demanda; era preciso um conjunto de ferramentas soltas e desconectadas para transformar aquele
              interesse em cliente atendido, mesa reservada, venda concluída — geralmente um sistema para atendimento
              no Instagram, outro para reservas, outro para organização da loja, nenhum conversando entre si.
            </p>
            <p>
              Foi enxergando essa lacuna, todos os dias, dentro da rotina real de restaurantes e franquias, que Igor
              decidiu construir a solução que ele mesmo precisava para seus clientes: uma plataforma única, que
              unisse autoatendimento no Instagram, sistema de reservas e funcionalidades pensadas para o dia a dia da
              operação — sem depender de múltiplas ferramentas para o marketing virar resultado de fato no salão.
            </p>
            <p>
              O Quero Reservar nasceu assim: não como um produto pensado de fora para dentro, mas como resposta
              direta a um problema que Igor via — e resolvia manualmente — em cada negócio que ele fazia crescer.
            </p>
          </SpotCard>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
