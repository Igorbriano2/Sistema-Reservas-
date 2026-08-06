import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

// Interessados que preencheram o formulario de contato/lista de espera na landing
// page (secao de preco) - nao ligados a nenhuma empresa/unidade ainda, ja que ainda
// nao existe integracao de pagamento (ver .do/app.api.yaml e o backlog).
export const waitlistLeads = pgTable("waitlist_leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  email: text("email").notNull(),
  whatsapp: text("whatsapp").notNull(),
  nomeRestaurante: text("nome_restaurante").notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export type WaitlistLead = typeof waitlistLeads.$inferSelect;
export type NovoWaitlistLead = typeof waitlistLeads.$inferInsert;
