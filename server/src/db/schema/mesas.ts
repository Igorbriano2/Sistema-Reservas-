import { pgTable, uuid, text, integer, real, pgEnum, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { saloes } from "./saloes.js";

export const mesaFormatoEnum = pgEnum("mesa_formato", ["redonda", "quadrada", "retangular"]);

export const mesas = pgTable(
  "mesas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    salaoId: uuid("salao_id")
      .notNull()
      .references(() => saloes.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    capacidadeMin: integer("capacidade_min").notNull(),
    capacidadeMax: integer("capacidade_max").notNull(),
    formato: mesaFormatoEnum("formato").notNull().default("redonda"),
    // IDs de outras mesas que podem ser combinadas com esta (juntar mesas para grupos maiores).
    combinavelCom: uuid("combinavel_com").array().notNull().default(sql`'{}'::uuid[]`),
    // Posicao/tamanho no editor visual do salao (doc 11) - em unidades do canvas SVG,
    // nao pixels de tela. Nulo ate a mesa ser posicionada pela primeira vez (mesas
    // criadas antes do editor existir, ou por algum outro fluxo).
    posX: real("pos_x"),
    posY: real("pos_y"),
    largura: real("largura"),
    altura: real("altura"),
  },
  (table) => [
    index("mesas_salao_id_idx").on(table.salaoId),
    check("mesas_capacidade_check", sql`${table.capacidadeMin} > 0 AND ${table.capacidadeMax} >= ${table.capacidadeMin}`),
  ],
);

export type Mesa = typeof mesas.$inferSelect;
export type NovaMesa = typeof mesas.$inferInsert;
