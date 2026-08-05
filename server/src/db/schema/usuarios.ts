import { pgTable, uuid, text, timestamp, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";
import { empresas } from "./empresas.js";

// MVP: apenas "admin" (um login admin por empresa). Papeis adicionais
// (gerente, atendente, etc.) ficam para depois do MVP validado.
export const papelUsuarioEnum = pgEnum("papel_usuario", ["admin"]);

export const usuarios = pgTable(
  "usuarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    email: text("email").notNull(),
    senhaHash: text("senha_hash").notNull(),
    papel: papelUsuarioEnum("papel").notNull().default("admin"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("usuarios_email_idx").on(table.email),
    index("usuarios_empresa_id_idx").on(table.empresaId),
  ],
);

export type Usuario = typeof usuarios.$inferSelect;
export type NovoUsuario = typeof usuarios.$inferInsert;
