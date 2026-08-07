import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// So pra idempotencia do webhook da Stripe: a Stripe pode reentregar o mesmo evento
// mais de uma vez (mesma garantia "pelo menos uma vez" do webhook do Instagram) - o id
// do evento (evt_...) e a chave primaria, entao um INSERT com onConflictDoNothing
// (ver lib/stripe-webhook.ts) diz na hora se e reentrega sem precisar de outra query.
export const stripeWebhookEventos = pgTable("stripe_webhook_eventos", {
  id: text("id").primaryKey(),
  tipo: text("tipo").notNull(),
  recebidoEm: timestamp("recebido_em", { withTimezone: true }).notNull().defaultNow(),
});

export type StripeWebhookEvento = typeof stripeWebhookEventos.$inferSelect;
