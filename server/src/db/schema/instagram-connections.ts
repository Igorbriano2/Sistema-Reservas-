import { pgTable, uuid, text, pgEnum, index } from "drizzle-orm/pg-core";
import { empresas } from "./empresas.js";
import { unidades } from "./unidades.js";

export const instagramConnectionStatusEnum = pgEnum("instagram_connection_status", [
  "ativo",
  "inativo",
]);

export const instagramConnections = pgTable(
  "instagram_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    // Nullable: no MVP uma conexao pode ser da empresa toda (varias unidades
    // atendidas pela mesma conta do Instagram) em vez de exclusiva de uma unidade.
    unidadeId: uuid("unidade_id").references(() => unidades.id, { onDelete: "cascade" }),
    igBusinessAccountId: text("ig_business_account_id").notNull(),
    // Token colado manualmente (fluxo OAuth self-service fica para depois do MVP).
    // Deve ser armazenado cifrado pela camada de aplicacao (nunca em texto puro).
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    status: instagramConnectionStatusEnum("status").notNull().default("ativo"),
  },
  (table) => [
    index("instagram_connections_empresa_id_idx").on(table.empresaId),
    index("instagram_connections_unidade_id_idx").on(table.unidadeId),
    index("instagram_connections_ig_account_idx").on(table.igBusinessAccountId),
  ],
);

export type InstagramConnection = typeof instagramConnections.$inferSelect;
export type NovaInstagramConnection = typeof instagramConnections.$inferInsert;
