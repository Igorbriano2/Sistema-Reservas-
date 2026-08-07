import { pgTable, uuid, text, integer, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { unidades } from "./unidades.js";

// Fila de espera de walk-in (doc 20) - diferente de waitlist_leads (captura de
// interesse pre-lancamento na landing page): aqui e o cliente que chegou fisicamente
// sem reserva e esta esperando mesa vagar. esperando -> chamado (dono avisa que a
// mesa esta pronta, dispara WhatsApp se houver telefone) -> sentado ou desistiu.
export const filaEsperaStatusEnum = pgEnum("fila_espera_status", ["esperando", "chamado", "sentado", "desistiu"]);

export const filaEspera = pgTable(
  "fila_espera",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unidadeId: uuid("unidade_id")
      .notNull()
      .references(() => unidades.id, { onDelete: "cascade" }),
    clienteNome: text("cliente_nome").notNull(),
    // Opcional - sem telefone o dono so acompanha a fila na tela, sem aviso por
    // WhatsApp automatico quando chamar o cliente.
    clienteTelefone: text("cliente_telefone"),
    numPessoas: integer("num_pessoas").notNull(),
    status: filaEsperaStatusEnum("status").notNull().default("esperando"),
    observacoes: text("observacoes"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    chamadoEm: timestamp("chamado_em", { withTimezone: true }),
    // Marca o fim da espera (mesa ocupada ou o cliente foi embora) - serve tanto pra
    // "sentado" quanto "desistiu", nao precisa de uma coluna por status.
    finalizadoEm: timestamp("finalizado_em", { withTimezone: true }),
  },
  (table) => [
    index("fila_espera_unidade_id_idx").on(table.unidadeId),
    index("fila_espera_unidade_status_idx").on(table.unidadeId, table.status),
  ],
);

export type FilaEspera = typeof filaEspera.$inferSelect;
export type NovaFilaEspera = typeof filaEspera.$inferInsert;
