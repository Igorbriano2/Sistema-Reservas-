import { pgTable, uuid, text, timestamp, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";
import { empresas } from "./empresas.js";

// owner: acesso total (mesas, saloes, regras de horario, config do agente, usuarios,
// reservas). funcionario: acesso restrito a reservas do dia (ver/criar/editar/cancelar).
// Sem permissoes granulares por unidade ainda - fica para depois do MVP validado.
export const papelUsuarioEnum = pgEnum("papel_usuario", ["owner", "funcionario"]);

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
    papel: papelUsuarioEnum("papel").notNull().default("owner"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("usuarios_email_idx").on(table.email),
    index("usuarios_empresa_id_idx").on(table.empresaId),
  ],
);

export type Usuario = typeof usuarios.$inferSelect;
export type NovoUsuario = typeof usuarios.$inferInsert;
