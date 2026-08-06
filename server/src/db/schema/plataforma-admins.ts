import { pgTable, uuid, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Login de dono da plataforma (voce) - completamente separado de usuarios (que sao
// sempre donos/funcionarios de UMA empresa/restaurante). Nunca tem empresa_id: um
// token de plataforma_admin nao carrega nem aceita esse campo, entao mesmo com bug
// de permissao um login de restaurante nao consegue virar acesso de plataforma.
export const plataformaAdmins = pgTable(
  "plataforma_admins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nome: text("nome").notNull(),
    email: text("email").notNull(),
    senhaHash: text("senha_hash").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("plataforma_admins_email_idx").on(table.email)],
);

export type PlataformaAdmin = typeof plataformaAdmins.$inferSelect;
export type NovoPlataformaAdmin = typeof plataformaAdmins.$inferInsert;
