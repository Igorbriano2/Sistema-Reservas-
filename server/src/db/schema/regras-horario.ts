import { pgTable, uuid, integer, text, time, boolean, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { unidades } from "./unidades.js";

export const regrasHorario = pgTable(
  "regras_horario",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unidadeId: uuid("unidade_id")
      .notNull()
      .references(() => unidades.id, { onDelete: "cascade" }),
    // 0 = domingo ... 6 = sabado
    diaSemana: integer("dia_semana").notNull(),
    // Nome do turno (doc 19) - ex: "Almoco", "Jantar". Nulo = turno sem nome
    // (comportamento anterior, so um bloco de horario por dia).
    nome: text("nome"),
    horaAbertura: time("hora_abertura").notNull(),
    horaFechamento: time("hora_fechamento").notNull(),
    duracaoPadraoMin: integer("duracao_padrao_min").notNull().default(90),
    bufferMin: integer("buffer_min").notNull().default(0),
    // Antecedencia minima (doc 19) - quantos minutos antes do horario o cliente
    // precisa reservar. 0 = sem restricao (comportamento anterior).
    antecedenciaMinMin: integer("antecedencia_min_min").notNull().default(0),
    // Desconto informativo (doc 19) - percentual mostrado ao cliente nesse turno
    // (ex.: happy hour). Nulo = sem desconto. So exibicao, nao afeta cobranca.
    descontoPercentual: integer("desconto_percentual"),
    // Reserva com cobranca (doc 22) - quando marcado, a reserva PUBLICA (pelo link do
    // agente) so se confirma depois de um deposito pago via Stripe. Reserva manual
    // pelo painel (dono/funcionario) NUNCA exige isso - mesma logica de antecedencia
    // minima, que so vale pro fluxo publico.
    exigeDeposito: boolean("exige_deposito").notNull().default(false),
    valorDepositoCentavos: integer("valor_deposito_centavos"),
    // Horarios fixos (doc 28) - quando preenchido, a reserva PUBLICA (link do agente,
    // widget) so aceita esses horarios de INICIO especificos (ex.: ["19:00"] pra um
    // rodizio que so abre reserva as 19h), em vez de qualquer horario dentro da janela
    // abertura/fechamento. Nulo/vazio = comportamento anterior (qualquer horario na
    // janela). NAO restringe reserva manual feita pelo dono/funcionario no painel -
    // mesmo criterio de "so vale pro fluxo publico" ja usado em exigeDeposito.
    horariosFixos: text("horarios_fixos").array(),
  },
  (table) => [
    index("regras_horario_unidade_id_idx").on(table.unidadeId),
    // Sem unicidade em (unidade, dia_semana): permite turnos multiplos no mesmo
    // dia (ex.: almoco e jantar) como linhas separadas.
    check("regras_horario_dia_semana_check", sql`${table.diaSemana} BETWEEN 0 AND 6`),
    check(
      "regras_horario_intervalo_check",
      sql`${table.horaFechamento} > ${table.horaAbertura}`,
    ),
    check("regras_horario_antecedencia_check", sql`${table.antecedenciaMinMin} >= 0`),
    check(
      "regras_horario_desconto_check",
      sql`${table.descontoPercentual} IS NULL OR ${table.descontoPercentual} BETWEEN 0 AND 100`,
    ),
    check(
      "regras_horario_deposito_check",
      sql`NOT ${table.exigeDeposito} OR ${table.valorDepositoCentavos} > 0`,
    ),
  ],
);

export type RegraHorario = typeof regrasHorario.$inferSelect;
export type NovaRegraHorario = typeof regrasHorario.$inferInsert;
