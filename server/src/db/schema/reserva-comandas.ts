import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { reservas } from "./reservas.js";

// Doc 46 (redesign) - uma reserva pode ter VARIAS comandas (ex: grupo de 7 pessoas
// com comandas individuais na Cervegela), addicionadas no momento de sentar ou depois
// (atendente pode ir criando comanda nova conforme chega mais gente na mesa). Por isso
// tabela propria em vez de um campo unico em "reservas" - o design antigo (reservas.
// comanda, texto unico) nao suportava mais de uma comanda por reserva.
export const reservaComandas = pgTable(
  "reserva_comandas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reservaId: uuid("reserva_id")
      .notNull()
      .references(() => reservas.id, { onDelete: "cascade" }),
    numero: text("numero").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("reserva_comandas_reserva_id_idx").on(table.reservaId)],
);

export type ReservaComanda = typeof reservaComandas.$inferSelect;
export type NovaReservaComanda = typeof reservaComandas.$inferInsert;
