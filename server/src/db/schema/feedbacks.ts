import { pgTable, uuid, text, integer, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { empresas } from "./empresas.js";
import { reservas } from "./reservas.js";

// Resposta do cliente ao template de feedback (WhatsApp), vinculada a reserva que
// motivou o envio. Nota e comentario sao independentes (o cliente pode responder so
// com nota, so com texto livre, ou os dois).
export const feedbacks = pgTable(
  "feedbacks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reservaId: uuid("reserva_id")
      .notNull()
      .references(() => reservas.id, { onDelete: "cascade" }),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    clienteTelefone: text("cliente_telefone").notNull(),
    nota: integer("nota"),
    comentarioTexto: text("comentario_texto"),
    recebidoEm: timestamp("recebido_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("feedbacks_reserva_id_idx").on(table.reservaId),
    index("feedbacks_empresa_id_idx").on(table.empresaId),
    check("feedbacks_nota_check", sql`${table.nota} IS NULL OR (${table.nota} BETWEEN 1 AND 5)`),
  ],
);

export type Feedback = typeof feedbacks.$inferSelect;
export type NovoFeedback = typeof feedbacks.$inferInsert;
