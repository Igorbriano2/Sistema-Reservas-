import { pgTable, uuid, text, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { empresas } from "./empresas.js";
import { unidades } from "./unidades.js";

// Uma linha por thread de conversa do Instagram (um ig_sender_id numa unidade).
export const conversas = pgTable(
  "conversas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    // Nullable (doc 17, parte 4): quando a conexao do Instagram e compartilhada por
    // varias unidades da empresa, uma conversa nova nasce sem unidade ainda resolvida
    // - o agente pergunta ao cliente qual unidade ele quer (tool
    // resolver_unidade_da_conversa) e so entao esse campo e preenchido, uma unica vez.
    unidadeId: uuid("unidade_id").references(() => unidades.id, { onDelete: "cascade" }),
    igSenderId: text("ig_sender_id").notNull(),
    // Quando true, o agente de IA para de responder automaticamente
    // (um humano assumiu a conversa pela Meta Business Suite).
    agentPaused: boolean("agent_paused").notNull().default(false),
    ultimaAtividadeHumanaEm: timestamp("ultima_atividade_humana_em", { withTimezone: true }),
  },
  (table) => [
    index("conversas_empresa_id_idx").on(table.empresaId),
    index("conversas_unidade_id_idx").on(table.unidadeId),
    // Uma thread por (empresa, sender) - nao mais por unidade, ja que a unidade pode
    // ainda nao estar resolvida quando a linha e criada (ver comentario acima).
    uniqueIndex("conversas_empresa_sender_unq").on(table.empresaId, table.igSenderId),
  ],
);

export type Conversa = typeof conversas.$inferSelect;
export type NovaConversa = typeof conversas.$inferInsert;
