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
import { saloes } from "./saloes.js";

export const reservaStatusEnum = pgEnum("reserva_status", [
  "pendente",
  "confirmada",
  "cancelada",
  "concluida",
  "no_show",
]);

// "widget" (doc 23) - reserva feita pelo cliente no widget embutido no site do
// proprio restaurante (sem thread do Instagram, igSenderId fica nulo igual "manual").
export const canalOrigemEnum = pgEnum("canal_origem", ["instagram", "manual", "widget"]);

// Reserva com cobranca (doc 22) - "nao_exigido" e o default histórico (turno sem
// deposito, ou reserva manual pelo painel). "pendente" nunca fica persistido de fato
// (a reserva so nasce depois do deposito confirmado) - existe pro tipo cobrir o
// estado transitorio no fluxo, mas hoje toda reserva no banco esta em nao_exigido,
// pago ou reembolsado.
export const statusPagamentoEnum = pgEnum("status_pagamento", ["nao_exigido", "pendente", "pago", "reembolsado"]);

export const reservas = pgTable(
  "reservas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unidadeId: uuid("unidade_id")
      .notNull()
      .references(() => unidades.id, { onDelete: "cascade" }),
    // Exatamente um dos dois (mesa_id, salao_id) e preenchido, nunca os dois nem
    // nenhum (ver reservas_alvo_unico_check): mesa_id no modo "mapa" (mesa
    // especifica), salao_id no modo "simples" (sem mesa, so soma capacidade do
    // salao inteiro).
    mesaId: uuid("mesa_id").references(() => mesas.id, { onDelete: "restrict" }),
    salaoId: uuid("salao_id").references(() => saloes.id, { onDelete: "restrict" }),
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
    // Doc 22 - deposito via Stripe. paymentIntentId fica nulo pra "nao_exigido".
    statusPagamento: statusPagamentoEnum("status_pagamento").notNull().default("nao_exigido"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("reservas_unidade_id_idx").on(table.unidadeId),
    index("reservas_mesa_id_idx").on(table.mesaId),
    // Acelera find_my_reservations / check_reservation_status (sempre filtrados por ig_sender_id).
    index("reservas_ig_sender_id_idx").on(table.igSenderId),
    index("reservas_unidade_data_idx").on(table.unidadeId, table.data),
    index("reservas_salao_id_idx").on(table.salaoId),
    check("reservas_num_pessoas_check", sql`${table.numPessoas} > 0`),
    check("reservas_horario_check", sql`${table.horaFim} > ${table.horaInicio}`),
    check(
      "reservas_alvo_unico_check",
      sql`(${table.mesaId} IS NOT NULL AND ${table.salaoId} IS NULL) OR (${table.mesaId} IS NULL AND ${table.salaoId} IS NOT NULL)`,
    ),
  ],
);

export type Reserva = typeof reservas.$inferSelect;
export type NovaReserva = typeof reservas.$inferInsert;
