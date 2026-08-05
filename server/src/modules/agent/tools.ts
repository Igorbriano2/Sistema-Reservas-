import type Anthropic from "@anthropic-ai/sdk";

// IMPORTANTE: nenhuma destas tools recebe unidade_id ou ig_sender_id como parametro.
// Esses dois valores sao SEMPRE resolvidos no backend a partir da conversa (ver
// modules/agent/context.ts) antes da tool ser executada - o modelo nunca decide quem
// esta falando nem em qual unidade, apenas o que fazer dentro desse contexto ja dado.
export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "check_availability",
    description:
      "Verifica se ha mesa disponivel para uma data, horario e numero de pessoas especificos. " +
      "Use antes de tentar criar uma reserva para saber quais mesas oferecer ao cliente.",
    input_schema: {
      type: "object",
      properties: {
        data: { type: "string", description: "Data no formato YYYY-MM-DD" },
        hora: { type: "string", description: "Horario no formato HH:MM (24h)" },
        num_pessoas: { type: "integer", minimum: 1, description: "Numero de pessoas na reserva" },
      },
      required: ["data", "hora", "num_pessoas"],
    },
  },
  {
    name: "create_reservation",
    description:
      "Cria uma nova reserva para o cliente que esta conversando. Use check_availability antes " +
      "para escolher um mesa_id valido e disponivel. Peca nome do cliente antes de chamar esta tool.",
    input_schema: {
      type: "object",
      properties: {
        data: { type: "string", description: "Data no formato YYYY-MM-DD" },
        hora: { type: "string", description: "Horario no formato HH:MM (24h)" },
        num_pessoas: { type: "integer", minimum: 1 },
        mesa_id: { type: "string", description: "ID da mesa (obtido via check_availability)" },
        nome: { type: "string", description: "Nome do cliente para a reserva" },
        telefone: { type: "string", description: "Telefone de contato do cliente (opcional)" },
      },
      required: ["data", "hora", "num_pessoas", "mesa_id", "nome"],
    },
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
