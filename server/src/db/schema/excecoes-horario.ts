import { pgTable, uuid, date, boolean, time, index, uniqueIndex } from "drizzle-orm/pg-core";
import { unidades } from "./unidades.js";

// Feriados, eventos especiais ou fechamentos pontuais que sobrescrevem regras_horario para uma data.
export const excecoesHorario = pgTable(
  "excecoes_horario",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unidadeId: uuid("unidade_id")
      .notNull()
      .references(() => unidades.id, { onDelete: "cascade" }),
    data: date("data").notNull(),
    fechado: boolean("fechado").notNull().default(false),
    // Preenchido apenas quando fechado = false e o horario do dia difere da regra padrao.
    horaAbertura: time("hora_abertura"),
    horaFechamento: time("hora_fechamento"),
  },
  (table) => [
    index("excecoes_horario_unidade_id_idx").on(table.unidadeId),
    uniqueIndex("excecoes_horario_unidade_data_unq").on(table.unidadeId, table.data),
  ],
);

export type ExcecaoHorario = typeof excecoesHorario.$inferSelect;
export type NovaExcecaoHorario = typeof excecoesHorario.$inferInsert;
