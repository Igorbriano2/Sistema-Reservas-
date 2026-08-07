import { pgTable, uuid, text, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { empresas } from "./empresas.js";
import { unidades } from "./unidades.js";

export const whatsappConnectionStatusEnum = pgEnum("whatsapp_connection_status", ["ativo", "inativo"]);

// Mesmo padrao de instagram_connections: cada restaurante conecta o proprio numero
// (nao um numero unico compartilhado da plataforma). unidade_id nullable = conexao
// vale pra empresa toda (varias unidades atendidas pelo mesmo WABA).
export const whatsappConnections = pgTable(
  "whatsapp_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    unidadeId: uuid("unidade_id").references(() => unidades.id, { onDelete: "cascade" }),
    wabaId: text("waba_id").notNull(),
    phoneNumberId: text("phone_number_id").notNull(),
    // Token colado manualmente (fluxo self-service/Embedded Signup fica para depois -
    // mesma decisao ja tomada pro Instagram). Cifrado com o mesmo TOKEN_ENCRYPTION_KEY
    // (ver lib/crypto.ts), nunca em texto puro.
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    status: whatsappConnectionStatusEnum("status").notNull().default("ativo"),
    conectadoEm: timestamp("conectado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("whatsapp_connections_empresa_id_idx").on(table.empresaId),
    index("whatsapp_connections_unidade_id_idx").on(table.unidadeId),
    index("whatsapp_connections_phone_number_id_idx").on(table.phoneNumberId),
  ],
);

export type WhatsappConnection = typeof whatsappConnections.$inferSelect;
export type NovaWhatsappConnection = typeof whatsappConnections.$inferInsert;
