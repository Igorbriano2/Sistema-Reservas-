import {
  pgTable,
  uuid,
  text,
  integer,
  date,
  time,
  timestamp,
  pgEnum,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { unidades } from "./unidades.js";
import { mesas } from "./mesas.js";

export const reservaStatusEnum = pgEnum("reserva_status", [
  "pendente",
  "confirmada",
  "cancelada",
  "concluida",
  "no_show",
]);

export const canalOrigemEnum = pgEnum("canal_origem", ["instagram", "manual"]);

export const reservas = pgTable(
  "reservas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unidadeId: uuid("unidade_id")
      .notNull()
      .references(() => unidades.id, { onDelete: "cascade" }),
    mesaId: uuid("mesa_id")
      .notNull()
      .references(() => mesas.id, { onDelete: "restrict" }),
    // Nulo quando canal_origem = "manual" (reserva criada pelo admin, sem thread do Instagram).
    igSenderId: text("ig_sender_id"),
    clienteNome: text("cliente_nome").notNull(),
    clienteTelefone: text("cliente_telefone"),
    numPessoas: integer("num_pessoas").notNull(),
    data: date("data").notNull(),
    horaInicio: time("hora_inicio").notNull(),
    horaFim: time("hora_fim").notNull(),
    status: reservaStatusEnum("status").notNull().default("confirmada"),
    observacoes: text("observacoes"),
    canalOrigem: canalOrigemEnum("canal_origem").notNull().default("manual"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("reservas_unidade_id_idx").on(table.unidadeId),
    index("reservas_mesa_id_idx").on(table.mesaId),
    // Acelera find_my_reservations / check_reservation_status (sempre filtrados por ig_sender_id).
    index("reservas_ig_sender_id_idx").on(table.igSenderId),
    index("reservas_unidade_data_idx").on(table.unidadeId, table.data),
    check("reservas_num_pessoas_check", sql`${table.numPessoas} > 0`),
    check("reservas_horario_check", sql`${table.horaFim} > ${table.horaInicio}`),
  ],
);

export type Reserva = typeof reservas.$inferSelect;
export type NovaReserva = typeof reservas.$inferInsert;
