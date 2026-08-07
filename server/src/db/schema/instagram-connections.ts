import { pgTable, uuid, text, pgEnum, index } from "drizzle-orm/pg-core";
import { empresas } from "./empresas.js";
import { unidades } from "./unidades.js";

// "expirada": o token foi revogado ou venceu - detectado automaticamente quando uma
// chamada de envio ao Instagram volta com erro de autenticacao (ver instagram-api.ts/
// instagram-notify.ts), nao e escolhido manualmente por ninguem.
export const instagramConnectionStatusEnum = pgEnum("instagram_connection_status", [
  "ativo",
  "inativo",
  "expirada",
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
    // @handle da conta - so preenchido pelo fluxo OAuth self-service (a conexao
    // manual via CLI nao tem como descobrir isso sozinha), usado so pra exibicao.
    handle: text("handle"),
    // Colado manualmente (instagram:connect) OU obtido via OAuth self-service
    // (/auth/instagram/callback) - os dois fluxos gravam aqui do mesmo jeito.
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
