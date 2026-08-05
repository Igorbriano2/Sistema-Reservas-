import { pgTable, uuid, text, index } from "drizzle-orm/pg-core";
import { empresas } from "./empresas.js";

export const unidades = pgTable(
  "unidades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    endereco: text("endereco"),
    // Timezone IANA, ex: "America/Sao_Paulo". Cada unidade pode estar em fuso diferente.
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  },
  (table) => [index("unidades_empresa_id_idx").on(table.empresaId)],
);

export type Unidade = typeof unidades.$inferSelect;
export type NovaUnidade = typeof unidades.$inferInsert;
