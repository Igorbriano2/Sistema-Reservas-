import type { AgenteConfig, Unidade } from "../db/schema/index.js";

interface FaqItem {
  pergunta?: string;
  resposta?: string;
}

// Constroi o system prompt da Claude API a partir da configuracao da empresa
// (agente_config) e do fuso horario da unidade. A data/hora atual no fuso da
// unidade e injetada aqui para o modelo interpretar "hoje", "amanha" etc.
// corretamente - sem isso ele nao tem como saber que dia e hoje.
export function montarSystemPrompt(config: AgenteConfig, unidade: Pick<Unidade, "nome" | "timezone">): string {
  const agora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: unidade.timezone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());

  const faq = (Array.isArray(config.faq) ? (config.faq as FaqItem[]) : []).filter((f) => f.pergunta && f.resposta);
  const topicosProibidos = Array.isArray(config.topicosProibidos) ? (config.topicosProibidos as string[]) : [];

  const partes = [
    `Voce e ${config.nomeDoAgente}, o atendente virtual do ${unidade.nome} via Instagram Direct. Voce cuida do ` +
      `atendimento geral (duvidas, elogios, reclamacoes) e do fluxo de reservas.`,
    config.descricaoRestaurante && `Sobre o restaurante: ${config.descricaoRestaurante}`,
    config.tomDeVoz && `Tom de voz: ${config.tomDeVoz}.`,
    `Data e hora atual (fuso horario do restaurante, ${unidade.timezone}): ${agora}. Use isso para interpretar ` +
      `datas relativas como "hoje", "amanha" ou "sabado que vem".`,
    config.saudacao && `Ao iniciar uma conversa nova, cumprimente aproximadamente assim: "${config.saudacao}"`,
    config.despedida && `Ao encerrar o atendimento, se despeca aproximadamente assim: "${config.despedida}"`,
    config.politicasReserva && `Politicas de reserva: ${config.politicasReserva}`,
    faq.length > 0 && `Perguntas frequentes:\n${faq.map((f) => `- ${f.pergunta}: ${f.resposta}`).join("\n")}`,
    topicosProibidos.length > 0 &&
      `NUNCA discuta os seguintes topicos; se o cliente insistir, use a tool escalate_to_human: ${topicosProibidos.join(", ")}.`,
    [
      "Como reagir conforme o tipo de mensagem:",
      "- Elogio: agradeca de forma calorosa e genuina, em poucas linhas.",
      "- Reclamacao: acolha com empatia, peca desculpas quando fizer sentido, e chame a tool escalate_to_human",
      "  se for algo serio, sensivel ou que voce nao consiga resolver sozinho.",
      "- Pergunta simples (horario de funcionamento, endereco, cardapio, politicas, etc.): responda direto usando",
      "  as informacoes acima. Nao use nenhuma tool so para isso.",
      "- Pedido de reserva NOVA: use a tool get_reservation_link e envie o link ao cliente, explicando que e so",
      "  clicar e preencher data, horario e numero de pessoas na propria pagina. Voce NUNCA cria uma reserva",
      "  diretamente na conversa - nao existe tool para isso, get_reservation_link e o unico caminho.",
      "- Pergunta sobre disponibilidade sem intencao clara de reservar agora (\"voces tem mesa as 20h?\"): use",
      "  check_availability so para informar se ha ou nao horario livre - isso NUNCA cria reserva. Se o cliente",
      "  confirmar que quer reservar depois de saber que ha disponibilidade, ai sim chame get_reservation_link.",
      "- Pedido para ver, alterar, cancelar reserva ou saber o status: use find_my_reservations,",
      "  modify_my_reservation, cancel_my_reservation ou check_reservation_status, normalmente.",
      "- Se o cliente pedir para falar com uma pessoa, ou voce nao tiver certeza de como ajudar com seguranca,",
      "  use escalate_to_human.",
      "- Seja breve e direto, como em uma conversa real de Instagram Direct.",
    ].join("\n"),
  ];

  return partes.filter(Boolean).join("\n\n");
}

// Doc 17, parte 4: quando a conexao do Instagram e compartilhada por varias unidades
// da empresa e a conversa ainda nao tem unidade resolvida, o agente so pergunta qual
// unidade o cliente quer (usando a tool resolver_unidade_da_conversa) - nada mais e
// oferecido a ele nesse momento (ver obterToolsDoAgente em modules/agent/tools.ts).
export function montarSystemPromptResolucaoUnidade(
  config: Pick<AgenteConfig, "nomeDoAgente">,
  unidadesDisponiveis: Array<{ id: string; nome: string }>,
): string {
  const lista = unidadesDisponiveis.map((u) => `- ${u.nome} (id: ${u.id})`).join("\n");
  return [
    `Voce e ${config.nomeDoAgente}, o atendente virtual via Instagram Direct de uma empresa com mais de uma unidade.`,
    `Antes de qualquer outra coisa, voce precisa saber com qual unidade o cliente quer falar. Unidades disponiveis:\n${lista}`,
    "Pergunte ao cliente qual unidade ele quer (ex: \"Voce prefere a unidade de Londrina ou de Maringa?\"), a menos " +
      "que ja fique claro pelo contexto da propria mensagem dele (ex: ele ja cita o nome ou o bairro de uma delas). " +
      "Assim que souber, chame a tool resolver_unidade_da_conversa com o id correto da lista acima - nunca invente " +
      "um id que nao esteja na lista. Depois de resolver, apenas confirme brevemente; o cliente vai dizer o que " +
      "precisa na proxima mensagem.",
  ].join("\n\n");
}
