import { pgTable, uuid, text, timestamp, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";
import { empresas } from "./empresas.js";

// owner: acesso total a TODAS as unidades da empresa (mesas, saloes, regras de
// horario, config do agente, usuarios, reservas, assinatura) - implicito pelo papel,
// nunca precisa de linha em usuario_unidades.
// gerente/funcionario: escopados a unidades especificas via usuario_unidades (podem
// ter 1 ou mais). gerente pode editar mapa/mesas/horarios e ver reservas; funcionario
// so ve/edita reservas do dia. Algumas acoes de gerente sao "configuraveis" por
// unidade (ver usuario_unidades.permissoesExtra) - o dono decide se libera editar
// agente/ver relatorios pra um gerente especifico.
export const papelUsuarioEnum = pgEnum("papel_usuario", ["owner", "gerente", "funcionario"]);

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
