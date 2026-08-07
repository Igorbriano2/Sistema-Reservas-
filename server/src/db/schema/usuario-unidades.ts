import { pgTable, uuid, jsonb, unique, index } from "drizzle-orm/pg-core";
import { usuarios } from "./usuarios.js";
import { unidades } from "./unidades.js";

// So existe linha aqui pra gerente/funcionario (owner tem acesso implicito a toda
// unidade da empresa, sem precisar disso). Um usuario pode ter varias linhas -
// acesso a mais de uma unidade ao mesmo tempo.
export const usuarioUnidades = pgTable(
  "usuario_unidades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    unidadeId: uuid("unidade_id")
      .notNull()
      .references(() => unidades.id, { onDelete: "cascade" }),
    // Lista de strings livres pra ligar permissoes "configuraveis" (ver tabela de
    // permissoes do doc 17) so pra ESSE usuario nessa unidade - ex: ["editar_agente",
    // "ver_relatorios", "criar_usuarios"]. Vazio/nulo = so as permissoes fixas do
    // papel (gerente ja tem mesas/mapa/reservas por padrao, sem precisar disso).
    permissoesExtra: jsonb("permissoes_extra").$type<string[]>(),
  },
  (table) => [
    // Um usuario nao pode ter duas linhas pra mesma unidade (evita ambiguidade de
    // qual permissoes_extra vale).
    unique("usuario_unidades_usuario_unidade_unique").on(table.usuarioId, table.unidadeId),
    index("usuario_unidades_usuario_id_idx").on(table.usuarioId),
    index("usuario_unidades_unidade_id_idx").on(table.unidadeId),
  ],
);

export type UsuarioUnidade = typeof usuarioUnidades.$inferSelect;
export type NovoUsuarioUnidade = typeof usuarioUnidades.$inferInsert;
