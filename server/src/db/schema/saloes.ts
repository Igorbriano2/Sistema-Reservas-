import { pgTable, uuid, text, integer, pgEnum, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { unidades } from "./unidades.js";

// "simples": o dono so cadastra a capacidade total simultanea do salao (sem mesas
// individuais) - a disponibilidade soma num_pessoas das reservas ativas no horario.
// "mapa": comportamento classico de mesas individuais (capacidade_total fica sem uso).
export const modoConfiguracaoSalaoEnum = pgEnum("modo_configuracao_salao", ["simples", "mapa"]);

export const saloes = pgTable(
  "saloes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unidadeId: uuid("unidade_id")
      .notNull()
      .references(() => unidades.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    modoConfiguracao: modoConfiguracaoSalaoEnum("modo_configuracao").notNull().default("simples"),
    // So usada no modo "simples". Nula ate o dono configurar; nesse estado o salao
    // fica indisponivel para reservas (ver criarReservaSimples/verificarDisponibilidade).
    capacidadeTotal: integer("capacidade_total"),
  },
  (table) => [
    index("saloes_unidade_id_idx").on(table.unidadeId),
    check("saloes_capacidade_total_check", sql`${table.capacidadeTotal} IS NULL OR ${table.capacidadeTotal} > 0`),
  ],
);

export type Salao = typeof saloes.$inferSelect;
export type NovoSalao = typeof saloes.$inferInsert;
