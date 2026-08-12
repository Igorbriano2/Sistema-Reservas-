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
              Igor Briano é fundador do Quero Reservar. Ao liderar o crescimento de negócios como a Espetaria
              Cervegela, percebeu que o marketing gerava demanda, mas a operação dependia de várias ferramentas
              desconectadas para transformar isso em resultado — autoatendimento no Instagram, reservas, organização
              da loja.
            </p>
            <p>
              Criou o Quero Reservar para resolver isso em uma única plataforma, pensada para o dia a dia real de
              restaurantes e franquias.
            </p>
          </SpotCard>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
