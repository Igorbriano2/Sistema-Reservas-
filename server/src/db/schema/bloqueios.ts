import { pgTable, uuid, text, date, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { unidades } from "./unidades.js";
import { mesas } from "./mesas.js";
import { saloes } from "./saloes.js";

// Bloqueio de uma mesa OU de um salao inteiro por um periodo (manutencao, evento
// privado, etc) - exatamente um dos dois (mesa_id, salao_id) e preenchido, nunca os
// dois nem nenhum (ver bloqueios_alvo_unico_check). unidade_id fica direto na tabela
// (em vez de so derivado via mesa/salao) pra manter a mesma isolacao multi-tenant
// simples usada no resto do admin.
export const bloqueios = pgTable(
  "bloqueios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unidadeId: uuid("unidade_id")
      .notNull()
      .references(() => unidades.id, { onDelete: "cascade" }),
    mesaId: uuid("mesa_id").references(() => mesas.id, { onDelete: "cascade" }),
    salaoId: uuid("salao_id").references(() => saloes.id, { onDelete: "cascade" }),
    dataInicio: date("data_inicio").notNull(),
    dataFim: date("data_fim").notNull(),
    motivo: text("motivo").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("bloqueios_unidade_id_idx").on(table.unidadeId),
    index("bloqueios_mesa_id_idx").on(table.mesaId),
    index("bloqueios_salao_id_idx").on(table.salaoId),
    index("bloqueios_unidade_periodo_idx").on(table.unidadeId, table.dataInicio, table.dataFim),
    check(
      "bloqueios_alvo_unico_check",
      sql`(${table.mesaId} IS NOT NULL AND ${table.salaoId} IS NULL) OR (${table.mesaId} IS NULL AND ${table.salaoId} IS NOT NULL)`,
    ),
    check("bloqueios_periodo_check", sql`${table.dataFim} >= ${table.dataInicio}`),
  ],
);

export type Bloqueio = typeof bloqueios.$inferSelect;
export type NovoBloqueio = typeof bloqueios.$inferInsert;
