import { pgTable, uuid, date, boolean, time, text, index, uniqueIndex } from "drizzle-orm/pg-core";
import { unidades } from "./unidades.js";

// Feriados, eventos especiais ou fechamentos pontuais que sobrescrevem regras_horario para uma data.
// Toda linha aqui (fechada ou nao) tambem conta como "feriado municipal" pra
// lib/feriados.ts decidir o valor do rodizio por dia (ver doc 26) - nao precisa de
// tabela separada, o dono ja marca a data especial uma unica vez aqui.
export const excecoesHorario = pgTable(
  "excecoes_horario",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unidadeId: uuid("unidade_id")
      .notNull()
      .references(() => unidades.id, { onDelete: "cascade" }),
    data: date("data").notNull(),
    // Nome livre pro dono identificar a data (ex: "Aniversario da cidade", "Corpus Christi") - opcional.
    nome: text("nome"),
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
