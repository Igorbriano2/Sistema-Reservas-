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
    // So obrigatorio pra owner (cadastrado no checkout, precisa de e-mail pra
    // recibo/recuperacao de senha). gerente/funcionario nunca tem e-mail - so
    // entram por username+senha, criados pelo dono direto no painel. A obrigatoriedade
    // por papel e validada na aplicacao (routes), nao aqui via CHECK constraint.
    email: text("email"),
    // Obrigatorio pra gerente/funcionario (e o "Id" de login deles). Owner tambem tem
    // um, alem do e-mail - pode entrar por qualquer um dos dois, mesma senha.
    username: text("username"),
    senhaHash: text("senha_hash").notNull(),
    papel: papelUsuarioEnum("papel").notNull().default("owner"),
    // Recuperacao de senha (so se aplica a owner, unico papel com e-mail) - guarda o
    // HASH do token (nunca o token cru), pra um vazamento do banco nao virar um token
    // de reset utilizavel direto. Nulos ate o primeiro pedido de "esqueci minha senha";
    // limpos de novo assim que o token e usado ou expira.
    resetSenhaTokenHash: text("reset_senha_token_hash"),
    resetSenhaExpiraEm: timestamp("reset_senha_expira_em", { withTimezone: true }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Unico entre os nao-nulos (varias linhas com email/username NULL nao conflitam
    // entre si - comportamento padrao de indice unico no Postgres).
    uniqueIndex("usuarios_email_idx").on(table.email),
    uniqueIndex("usuarios_username_idx").on(table.username),
    index("usuarios_empresa_id_idx").on(table.empresaId),
  ],
);

export type Usuario = typeof usuarios.$inferSelect;
export type NovoUsuario = typeof usuarios.$inferInsert;
