import { pgTable, uuid, text, integer, boolean, timestamp, pgEnum, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { empresas } from "./empresas.js";
import { feedbacks } from "./feedbacks.js";

// NPS customizavel (doc 21) - perguntas que o dono define pra substituir a pesquisa
// fixa (nota 1-5 + comentario livre) enviada por WhatsApp (doc 16). "escala" = nota de
// 1 a 5 (mesma faixa do NPS simples atual); "texto_curto" = resposta livre.
export const pesquisaPerguntaTipoEnum = pgEnum("pesquisa_pergunta_tipo", ["escala", "texto_curto"]);

export const pesquisaPerguntas = pgTable(
  "pesquisa_perguntas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    ordem: integer("ordem").notNull().default(0),
    tipo: pesquisaPerguntaTipoEnum("tipo").notNull(),
    texto: text("texto").notNull(),
    ativa: boolean("ativa").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("pesquisa_perguntas_empresa_id_idx").on(table.empresaId)],
);

export type PesquisaPergunta = typeof pesquisaPerguntas.$inferSelect;
export type NovaPesquisaPergunta = typeof pesquisaPerguntas.$inferInsert;

// Uma resposta por pergunta, agrupada por feedbackId (a mesma linha de "feedbacks"
// que ja ancora reserva/telefone/data - reaproveitada tambem pelo fluxo antigo de
// nota+comentario via resposta livre no WhatsApp).
export const pesquisaRespostas = pgTable(
  "pesquisa_respostas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    feedbackId: uuid("feedback_id")
      .notNull()
      .references(() => feedbacks.id, { onDelete: "cascade" }),
    perguntaId: uuid("pergunta_id")
      .notNull()
      .references(() => pesquisaPerguntas.id, { onDelete: "cascade" }),
    valorEscala: integer("valor_escala"),
    valorTexto: text("valor_texto"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("pesquisa_respostas_feedback_id_idx").on(table.feedbackId),
    check("pesquisa_respostas_valor_escala_check", sql`${table.valorEscala} IS NULL OR (${table.valorEscala} BETWEEN 1 AND 5)`),
  ],
);

export type PesquisaResposta = typeof pesquisaRespostas.$inferSelect;
export type NovaPesquisaResposta = typeof pesquisaRespostas.$inferInsert;
