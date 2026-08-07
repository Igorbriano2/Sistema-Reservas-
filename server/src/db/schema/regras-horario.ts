import { pgTable, uuid, integer, text, time, index, check } from "drizzle-orm/pg-core";
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
    // (ex.: happy hour). Nulo = sem desconto. So exibicao, nao afeta cobranca (nao
    // ha reserva com pagamento no MVP ainda).
    descontoPercentual: integer("desconto_percentual"),
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
  ],
);

export type RegraHorario = typeof regrasHorario.$inferSelect;
export type NovaRegraHorario = typeof regrasHorario.$inferInsert;
