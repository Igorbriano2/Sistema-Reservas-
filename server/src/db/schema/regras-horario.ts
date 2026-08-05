import { pgTable, uuid, integer, time, index, check } from "drizzle-orm/pg-core";
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
    horaAbertura: time("hora_abertura").notNull(),
    horaFechamento: time("hora_fechamento").notNull(),
    duracaoPadraoMin: integer("duracao_padrao_min").notNull().default(90),
    bufferMin: integer("buffer_min").notNull().default(0),
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
  ],
);

export type RegraHorario = typeof regrasHorario.$inferSelect;
export type NovaRegraHorario = typeof regrasHorario.$inferInsert;
