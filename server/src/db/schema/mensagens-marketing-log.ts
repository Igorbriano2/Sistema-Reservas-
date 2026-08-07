import { pgTable, uuid, text, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { empresas } from "./empresas.js";
import { reservas } from "./reservas.js";

export const tipoCampanhaEnum = pgEnum("tipo_campanha_marketing", ["feedback", "aniversario", "recuperacao"]);
export const statusCampanhaEnum = pgEnum("status_campanha_marketing", ["enviado", "falhou", "respondido"]);

// Auditoria + trava contra reenvio: antes de disparar qualquer campanha, o agendador
// confere aqui se ja mandou pro mesmo telefone no periodo relevante (ver
// lib/whatsapp-scheduler.ts). reserva_id so e preenchido pro tipo "feedback" (as
// outras campanhas nao partem de uma reserva especifica).
export const mensagensMarketingLog = pgTable(
  "mensagens_marketing_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    reservaId: uuid("reserva_id").references(() => reservas.id, { onDelete: "cascade" }),
    clienteTelefone: text("cliente_telefone").notNull(),
    tipo: tipoCampanhaEnum("tipo").notNull(),
    templateUsado: text("template_usado").notNull(),
    enviadoEm: timestamp("enviado_em", { withTimezone: true }).notNull().defaultNow(),
    status: statusCampanhaEnum("status").notNull(),
  },
  (table) => [
    index("mensagens_marketing_log_empresa_id_idx").on(table.empresaId),
    index("mensagens_marketing_log_telefone_tipo_idx").on(table.clienteTelefone, table.tipo),
    index("mensagens_marketing_log_reserva_id_idx").on(table.reservaId),
  ],
);

export type MensagemMarketingLog = typeof mensagensMarketingLog.$inferSelect;
export type NovaMensagemMarketingLog = typeof mensagensMarketingLog.$inferInsert;
export type TipoCampanhaMarketing = (typeof tipoCampanhaEnum.enumValues)[number];
