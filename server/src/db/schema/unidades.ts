import { pgTable, uuid, text, jsonb, index } from "drizzle-orm/pg-core";
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
    telefone: text("telefone"),
    // Lista de redes sociais: [{ "rede": "Instagram", "link": "https://instagram.com/..." }, ...]
    // - obrigatoria pro agente de IA responder com precisao quando o cliente perguntar
    // (ver montarSystemPrompt em lib/agent-prompt.ts).
    redesSociais: jsonb("redes_sociais").notNull().default([]),
    // Timezone IANA, ex: "America/Sao_Paulo". Cada unidade pode estar em fuso diferente.
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  },
  (table) => [index("unidades_empresa_id_idx").on(table.empresaId)],
);

export type Unidade = typeof unidades.$inferSelect;
export type NovaUnidade = typeof unidades.$inferInsert;
