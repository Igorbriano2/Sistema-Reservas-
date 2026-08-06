import { pgTable, uuid, text, boolean, timestamp, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { conversas } from "./conversas.js";

// Historico de turnos de texto de uma conversa. So guarda o texto final de cada
// turno (nao os blocos intermediarios de tool_use/tool_result) - cada chamada ao
// agente refaz seu proprio raciocinio com tools a partir desse historico resumido.
export const papelMensagemEnum = pgEnum("papel_mensagem", ["user", "assistant"]);

export const mensagens = pgTable(
  "mensagens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversaId: uuid("conversa_id")
      .notNull()
      .references(() => conversas.id, { onDelete: "cascade" }),
    papel: papelMensagemEnum("papel").notNull(),
    conteudo: text("conteudo").notNull(),
    // ID da mensagem no Instagram (mid). Usado para (1) detectar echo de mensagens
    // que o proprio agente enviou vs. mensagens enviadas por um humano pela Meta
    // Business Suite, e (2) deduplicar reentregas do webhook (Meta reentrega com
    // "at-least-once"). Nulo para mensagens sem correlato no Instagram.
    igMessageId: text("ig_message_id"),
    // true quando esta mensagem "assistant" foi enviada por um humano (Meta Business
    // Suite), nao pelo agente de IA.
    enviadoPorHumano: boolean("enviado_por_humano").notNull().default(false),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("mensagens_conversa_id_idx").on(table.conversaId, table.criadoEm),
    uniqueIndex("mensagens_ig_message_id_unq")
      .on(table.igMessageId)
      .where(sql`${table.igMessageId} is not null`),
  ],
);

export type Mensagem = typeof mensagens.$inferSelect;
export type NovaMensagem = typeof mensagens.$inferInsert;
export type PapelMensagem = (typeof papelMensagemEnum.enumValues)[number];
