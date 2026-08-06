// Bio e dados reais fornecidos pelo fundador (Igor Briano) - nao inventar nem
// arredondar numeros aqui. A foto e um placeholder ate o arquivo real ser
// adicionado ao repositorio (ver lp-fundador-foto-placeholder).
export function FounderSection() {
  return (
    <section className="lp-secao">
      <div className="lp-container lp-reveal">
        <h2>Quem está por trás do Quero Reservar</h2>
        <div className="lp-fundador">
          <div className="lp-fundador-foto-placeholder" role="img" aria-label="Foto de Igor Briano, fundador do Quero Reservar">
            <span>IB</span>
          </div>
          <div className="lp-fundador-texto">
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
          </div>
        </div>
      </div>
    </section>
  );
}
