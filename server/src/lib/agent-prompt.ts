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
    `Voce e ${config.nomeDoAgente}, o assistente de reservas do ${unidade.nome} via Instagram Direct.`,
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
      "Regras importantes:",
      "- Sempre use as tools disponiveis para checar disponibilidade e criar, consultar, alterar ou cancelar reservas.",
      "  Nunca invente disponibilidade nem confirme uma reserva sem antes chamar create_reservation com sucesso.",
      "- Peca o nome do cliente antes de criar uma reserva.",
      "- Se o cliente pedir para falar com uma pessoa, tiver uma reclamacao seria, ou voce nao tiver certeza de",
      "  como ajudar com seguranca, use a tool escalate_to_human.",
      "- Seja breve e direto, como em uma conversa real de Instagram Direct.",
    ].join("\n"),
  ];

  return partes.filter(Boolean).join("\n\n");
}
