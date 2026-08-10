import { pgTable, uuid, text, integer, boolean, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { unidades } from "./unidades.js";

// Cardapio implicito por unidade (sem entidade "cardapio" separada, mesma
// simplicidade de saloes/mesas) - categorias pertencem direto a unidade. "ordem"
// controla a posicao no cardapio (reordenar = so atualizar esse campo).
export const cardapioCategorias = pgTable(
  "cardapio_categorias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unidadeId: uuid("unidade_id")
      .notNull()
      .references(() => unidades.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    ordem: integer("ordem").notNull().default(0),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("cardapio_categorias_unidade_id_idx").on(table.unidadeId)],
);

export type CardapioCategoria = typeof cardapioCategorias.$inferSelect;
export type NovaCardapioCategoria = typeof cardapioCategorias.$inferInsert;

export const cardapioItens = pgTable(
  "cardapio_itens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoriaId: uuid("categoria_id")
      .notNull()
      .references(() => cardapioCategorias.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    descricao: text("descricao"),
    precoCentavos: integer("preco_centavos").notNull(),
    // URL da imagem - ou colada pelo dono (link externo ja hospedado em algum lugar)
    // ou preenchida automaticamente pelo upload (doc 32): nesse caso aponta pra
    // /public/cardapio-imagem/:itemId, que serve os bytes gravados abaixo. O resto do
    // sistema (pagina publica, tool get_menu do agente) so consome imagemUrl, sem
    // saber a origem.
    imagemUrl: text("imagem_url"),
    // Bytes da imagem enviada por upload, em base64 - nulo quando imagemUrl e um link
    // externo colado pelo dono (sem upload). Guardado no proprio Postgres (sem
    // depender de disco local, que e efemero no App Platform) pra ficar
    // "autohospedado" sem precisar de credenciais de object storage novas.
    imagemDados: text("imagem_dados"),
    imagemMimeType: text("imagem_mime_type"),
    // Quantas pessoas a porcao serve (ex: "serve ate 2") - nulo = nao se aplica.
    porcaoServePessoas: integer("porcao_serve_pessoas"),
    somenteMaiorIdade: boolean("somente_maior_idade").notNull().default(false),
    tags: jsonb("tags").$type<string[]>(),
    ordem: integer("ordem").notNull().default(0),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("cardapio_itens_categoria_id_idx").on(table.categoriaId)],
);

export type CardapioItem = typeof cardapioItens.$inferSelect;
export type NovoCardapioItem = typeof cardapioItens.$inferInsert;
