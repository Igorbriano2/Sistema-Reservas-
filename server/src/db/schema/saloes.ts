import { pgTable, uuid, text, index } from "drizzle-orm/pg-core";
import { unidades } from "./unidades.js";

export const saloes = pgTable(
  "saloes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unidadeId: uuid("unidade_id")
      .notNull()
      .references(() => unidades.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
  },
  (table) => [index("saloes_unidade_id_idx").on(table.unidadeId)],
);

export type Salao = typeof saloes.$inferSelect;
export type NovoSalao = typeof saloes.$inferInsert;
