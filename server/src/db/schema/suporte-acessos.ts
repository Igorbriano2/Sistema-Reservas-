import { pgTable, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { plataformaAdmins } from "./plataforma-admins.js";
import { empresas } from "./empresas.js";
import { usuarios } from "./usuarios.js";

// Trilha de auditoria de "acessar como" (suporte): toda vez que o dono da plataforma
// entra no painel de um restaurante sem senha (ver POST /plataforma/clientes/:id/acessar),
// fica registrado aqui quem acessou, a conta de quem, e quando - nunca apagado
// automaticamente, existe so pra consulta/auditoria (sem endpoint de leitura ainda,
// verificavel direto no banco se precisar).
export const suporteAcessos = pgTable(
  "suporte_acessos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plataformaAdminId: uuid("plataforma_admin_id")
      .notNull()
      .references(() => plataformaAdmins.id, { onDelete: "cascade" }),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    usuarioAcessadoId: uuid("usuario_acessado_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("suporte_acessos_empresa_id_idx").on(table.empresaId),
    index("suporte_acessos_plataforma_admin_id_idx").on(table.plataformaAdminId),
  ],
);

export type SuporteAcesso = typeof suporteAcessos.$inferSelect;
export type NovoSuporteAcesso = typeof suporteAcessos.$inferInsert;
