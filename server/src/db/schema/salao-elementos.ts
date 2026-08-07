import { pgTable, uuid, text, integer, real, pgEnum, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { saloes } from "./saloes.js";

// Objetos decorativos/estruturais do editor visual do salao (doc 11) - parede, porta,
// janela, planta, balcao/bar, banheiro, cozinha, cadeira avulsa. Diferente de mesas,
// nao sao reservaveis, entao ficam em tabela propria.
export const tipoElementoSalaoEnum = pgEnum("tipo_elemento_salao", [
  "parede",
  "porta",
  "janela",
  "planta",
  "balcao",
  "banheiro",
  "cozinha",
  "cadeira",
]);

export const salaoElementos = pgTable(
  "salao_elementos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    salaoId: uuid("salao_id")
      .notNull()
      .references(() => saloes.id, { onDelete: "cascade" }),
    tipo: tipoElementoSalaoEnum("tipo").notNull(),
    nome: text("nome").notNull(),
    // Unidades do canvas SVG (mesmo espaco de mesas.posX/posY) - sempre definidas na
    // criacao (nasce de um drag-drop com tamanho padrao), diferente de mesas onde e nulo
    // ate a primeira posicao.
    posX: real("pos_x").notNull(),
    posY: real("pos_y").notNull(),
    largura: real("largura").notNull(),
    altura: real("altura").notNull(),
    rotacao: real("rotacao").notNull().default(0),
    // So usado por "balcao" (numero de banquetas exibidas no desenho).
    capacidade: integer("capacidade"),
  },
  (table) => [
    index("salao_elementos_salao_id_idx").on(table.salaoId),
    check("salao_elementos_dimensoes_check", sql`${table.largura} > 0 AND ${table.altura} > 0`),
    check("salao_elementos_capacidade_check", sql`${table.capacidade} IS NULL OR ${table.capacidade} > 0`),
  ],
);

export type SalaoElemento = typeof salaoElementos.$inferSelect;
export type NovoSalaoElemento = typeof salaoElementos.$inferInsert;
