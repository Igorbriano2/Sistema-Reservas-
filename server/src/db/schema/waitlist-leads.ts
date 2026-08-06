import { pgTable, uuid, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { empresas } from "./empresas.js";

export const leadStatusEnum = pgEnum("lead_status", ["novo", "contatado", "convertido", "descartado"]);

// Interessados que preencheram o formulario de contato/lista de espera na landing
// page (secao de preco) - nao ligados a nenhuma empresa/unidade ate serem convertidos
// pelo painel da plataforma (ver modules/plataforma/leads.routes.ts).
export const waitlistLeads = pgTable("waitlist_leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  email: text("email").notNull(),
  whatsapp: text("whatsapp").notNull(),
  nomeRestaurante: text("nome_restaurante").notNull(),
  status: leadStatusEnum("status").notNull().default("novo"),
  convertidoEmpresaId: uuid("convertido_empresa_id").references(() => empresas.id, { onDelete: "set null" }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export type WaitlistLead = typeof waitlistLeads.$inferSelect;
export type NovoWaitlistLead = typeof waitlistLeads.$inferInsert;
