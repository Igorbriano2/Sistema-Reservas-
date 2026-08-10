import type Anthropic from "@anthropic-ai/sdk";

// IMPORTANTE: nenhuma destas tools recebe unidade_id ou ig_sender_id como parametro.
// Esses dois valores sao SEMPRE resolvidos no backend a partir da conversa (ver
// modules/agent/context.ts) antes da tool ser executada - o modelo nunca decide quem
// esta falando nem em qual unidade, apenas o que fazer dentro desse contexto ja dado.
export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "check_availability",
    description:
      "Consulta SOMENTE INFORMATIVA de disponibilidade para uma data, horario e numero de pessoas. " +
      "Use para responder perguntas do tipo 'tem mesa disponivel as 20h?' ou 'voces tem horario livre " +
      "amanha?'. Isso NUNCA cria, reserva ou bloqueia nada - e so pra informar o cliente. Para o cliente " +
      "efetivamente reservar, use a tool get_reservation_link. A resposta pode incluir turno_nome e " +
      "turno_desconto_percentual quando o horario cai num turno com nome ou desconto configurado - mencione " +
      "isso ao cliente quando fizer sentido (ex: happy hour).",
    input_schema: {
      type: "object",
      properties: {
        data: { type: "string", description: "Data no formato YYYY-MM-DD" },
        hora: { type: "string", description: "Horario no formato HH:MM (24h)" },
        num_pessoas: { type: "integer", minimum: 1, description: "Numero de pessoas" },
      },
      required: ["data", "hora", "num_pessoas"],
    },
  },
  {
    name: "get_reservation_link",
    description:
      "Gera um link pessoal e temporario (valido por 60 minutos) para o cliente fazer uma reserva " +
      "nova preenchendo os proprios dados numa pagina web. Use sempre que o cliente quiser reservar - " +
      "esta tool e o UNICO jeito de iniciar uma reserva nova; o agente nunca cria a reserva diretamente " +
      "na conversa. Depois de gerar o link, explique brevemente que e so clicar e preencher data, " +
      "horario e numero de pessoas.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "find_my_reservations",
    description:
      "Lista as reservas do cliente que esta conversando nesta unidade (passadas e futuras). " +
      "Use quando o cliente perguntar sobre suas reservas ou antes de modificar/cancelar uma.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "modify_my_reservation",
    description:
      "Altera uma reserva do cliente que esta conversando. So funciona se a reserva pertencer a " +
      "este mesmo cliente nesta unidade. Informe apenas os campos que devem mudar.",
    input_schema: {
      type: "object",
      properties: {
        reservation_id: { type: "string", description: "ID da reserva a alterar" },
        data: { type: "string", description: "Nova data no formato YYYY-MM-DD (opcional)" },
        hora: { type: "string", description: "Novo horario no formato HH:MM (opcional)" },
        num_pessoas: { type: "integer", minimum: 1, description: "Novo numero de pessoas (opcional)" },
        mesa_id: { type: "string", description: "Novo mesa_id, se precisar trocar de mesa (opcional)" },
      },
      required: ["reservation_id"],
    },
  },
  {
    name: "cancel_my_reservation",
    description:
      "Cancela uma reserva do cliente que esta conversando. So funciona se a reserva pertencer a " +
      "este mesmo cliente nesta unidade.",
    input_schema: {
      type: "object",
      properties: {
        reservation_id: { type: "string", description: "ID da reserva a cancelar" },
      },
      required: ["reservation_id"],
    },
  },
  {
    name: "check_reservation_status",
    description:
      "Verifica rapidamente se o cliente que esta conversando tem alguma reserva ativa (proxima) " +
      "nesta unidade e qual o status dela.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_menu",
    description:
      "Consulta o cardapio digital desta unidade (categorias e itens ativos, com preco, descricao, " +
      "porcao e se e so pra maiores de 18 anos). Use para responder perguntas sobre pratos, bebidas, " +
      "precos ou opcoes do cardapio (ex: 'o que voces tem de sobremesa?', 'tem opcao vegana?', 'quanto " +
      "custa a picanha?'). Nao inclui itens/categorias desativados pelo restaurante.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "check_rodizio_price",
    description:
      "Consulta o valor do rodizio (adulto e crianca) para uma data especifica, ja considerando se e dia " +
      "util, fim de semana, feriado (nacional ou municipal) ou vespera de feriado - a data certa e o " +
      "calendario de feriados NUNCA devem ser calculados por voce, sempre use esta tool. Use quando o " +
      "cliente perguntar quanto custa o rodizio, especialmente se mencionar um dia especifico (ex: 'quanto " +
      "custa no sabado', 'e se eu for no feriado'). Se nenhuma data for informada, considera hoje.",
    input_schema: {
      type: "object",
      properties: {
        data: { type: "string", description: "Data no formato YYYY-MM-DD (opcional; se omitido, usa hoje)" },
      },
    },
  },
  {
    name: "escalate_to_human",
    description:
      "Encaminha a conversa para um atendente humano e pausa as respostas automaticas. Use quando " +
      "o cliente pedir para falar com uma pessoa, houver uma reclamacao seria, uma duvida fora do " +
      "escopo do agente, ou qualquer situacao que voce nao consiga resolver com seguranca.",
    input_schema: {
      type: "object",
      properties: {
        motivo: { type: "string", description: "Motivo do encaminhamento, para o atendente entender o contexto" },
      },
      required: ["motivo"],
    },
  },
];

// So oferecida quando a conversa AINDA nao tem unidade resolvida (conexao do
// Instagram compartilhada por varias unidades - doc 17, parte 4). unidade_id precisa
// ser exatamente um dos ids listados no system prompt (montarSystemPromptResolucaoUnidade).
const RESOLVER_UNIDADE_TOOL: Anthropic.Tool = {
  name: "resolver_unidade_da_conversa",
  description:
    "Registra qual unidade o cliente escolheu, depois que ele responder qual unidade quer (ou isso ficar " +
    "claro pelo contexto). So chame esta tool DEPOIS de saber com certeza qual unidade, usando o id exato " +
    "de uma das unidades listadas no inicio desta conversa.",
  input_schema: {
    type: "object",
    properties: {
      unidade_id: { type: "string", description: "id (uuid) da unidade escolhida, exatamente como listado" },
    },
    required: ["unidade_id"],
  },
};

// Antes de resolver a unidade, o modelo so pode perguntar/registrar a escolha ou
// escalar para humano - nenhuma tool de reserva/disponibilidade fica visivel ainda,
// pra nunca responder (ou dar link de reserva) na unidade errada.
const ESCALATE_TOOL = AGENT_TOOLS.find((t) => t.name === "escalate_to_human")!;

export function obterToolsDoAgente(unidadeResolvida: boolean): Anthropic.Tool[] {
  if (unidadeResolvida) return AGENT_TOOLS;
  return [RESOLVER_UNIDADE_TOOL, ESCALATE_TOOL];
}
