import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { unidades } from "./unidades.js";

// Uma linha por dispositivo/navegador inscrito (endpoint do Push API e unico por
// instalacao) - varios funcionarios da mesma unidade podem estar inscritos ao mesmo
// tempo, todos recebem a notificacao (ver lib/push.ts).
export const pushSubscricoes = pgTable(
  "push_subscricoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unidadeId: uuid("unidade_id")
      .notNull()
      .references(() => unidades.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("push_subscricoes_unidade_id_idx").on(table.unidadeId)],
);

export type PushSubscricao = typeof pushSubscricoes.$inferSelect;
export type NovaPushSubscricao = typeof pushSubscricoes.$inferInsert;
