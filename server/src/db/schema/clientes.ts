import { pgTable, uuid, text, date, timestamp, boolean, unique, index } from "drizzle-orm/pg-core";
import { empresas } from "./empresas.js";

// Nao existia uma tabela de "clientes" antes desta feature (reservas guardavam nome/
// telefone direto na propria linha, sem normalizar) - criada aqui porque opt-in de
// WhatsApp e data de nascimento sao propriedades da PESSOA, nao de uma reserva
// especifica: precisam sobreviver entre reservas e ser consultaveis independente de
// uma reserva estar em andamento (ex: aniversario nao depende de reserva nenhuma).
// Chave natural (empresa_id, telefone) - upsert por telefone a cada reserva publica.
export const clientes = pgTable(
  "clientes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    telefone: text("telefone").notNull(),
    nome: text("nome"),
    dataNascimento: date("data_nascimento"),
    whatsappOptIn: boolean("whatsapp_opt_in").notNull().default(false),
    whatsappOptInEm: timestamp("whatsapp_opt_in_em", { withTimezone: true }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("clientes_empresa_telefone_unique").on(table.empresaId, table.telefone),
    index("clientes_empresa_id_idx").on(table.empresaId),
    index("clientes_data_nascimento_idx").on(table.dataNascimento),
  ],
);

export type Cliente = typeof clientes.$inferSelect;
export type NovoCliente = typeof clientes.$inferInsert;
