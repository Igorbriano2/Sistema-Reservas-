// Comparativo contra categorias genericas (planilha/WhatsApp manual, funcionario
// dedicado) - de proposito, nunca cita marca de concorrente real nem numero
// especifico de salario/mercado (ver TrustSection: nada aqui e inventado ou
// apresentado como estatistica de terceiro). O ponto de custo com funcionario
// e qualitativo (salario + encargos), nao um valor fixo em R$.
const LINHAS = [
  {
    criterio: "Atende fora do horário comercial",
    planilha: "Não",
    funcionario: "Não",
    queroReservar: "Sim, 24 horas por dia",
  },
  {
    criterio: "Custo mensal",
    planilha: "Sem custo direto, mas com tempo perdido e reserva esquecida",
    funcionario: "Salário + encargos (INSS, FGTS, 13º, férias) — na prática, bem mais que o salário combinado",
    queroReservar: "R$ 697/mês, fixo, sem encargos",
  },
  {
    criterio: "Risco de duplicar ou perder reserva",
    planilha: "Alto",
    funcionario: "Depende de quem está de plantão",
    queroReservar: "Baixo — o processo é sempre o mesmo",
  },
  {
    criterio: "Tempo de resposta ao cliente",
    planilha: "Depende de alguém ver a mensagem",
    funcionario: "Depende da disponibilidade da pessoa",
    queroReservar: "Imediato",
  },
  {
    criterio: "Escala pra mais de uma unidade",
    planilha: "Não escala",
    funcionario: "Precisa contratar mais gente",
    queroReservar: "Mesmo painel, equipe ilimitada",
  },
];

export function ComparisonSection() {
  return (
    <section className="lp-secao">
      <div className="lp-container lp-reveal">
        <h2>Planilha, funcionário dedicado ou Quero Reservar?</h2>
        <p className="lp-texto-grande" style={{ marginBottom: "2rem" }}>
          Não é sobre qual ferramenta é "melhor" — é sobre o que cada opção custa de verdade, em dinheiro e em
          reserva perdida.
        </p>
        <div className="lp-comparativo-wrap">
          <table className="lp-comparativo">
            <thead>
              <tr>
                <th scope="col"></th>
                <th scope="col">Planilha / WhatsApp manual</th>
                <th scope="col">Funcionário dedicado</th>
                <th scope="col">Quero Reservar</th>
              </tr>
            </thead>
            <tbody>
              {LINHAS.map((linha) => (
                <tr key={linha.criterio}>
                  <th scope="row">{linha.criterio}</th>
                  <td>{linha.planilha}</td>
                  <td>{linha.funcionario}</td>
                  <td>{linha.queroReservar}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
