import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import type { Database } from "../db/client.js";
import { assinaturas, stripeWebhookEventos } from "../db/schema/index.js";

// Insere o id do evento (chave primaria) e diz se ja existia - se a Stripe reentregar
// o mesmo evento (garantia "pelo menos uma vez"), a segunda tentativa nao reprocessa
// nada. Mesmo idioma ja usado pro dedup de mensagens do Instagram (ig_message_id).
export async function eventoJaProcessado(db: Database, event: Stripe.Event): Promise<boolean> {
  const [inserido] = await db
    .insert(stripeWebhookEventos)
    .values({ id: event.id, tipo: event.type })
    .onConflictDoNothing({ target: stripeWebhookEventos.id })
    .returning();
  return !inserido;
}

function idDeSubscription(valor: string | Stripe.Subscription | null | undefined): string | null {
  if (!valor) return null;
  return typeof valor === "string" ? valor : valor.id;
}

// A partir da API 2025-xx da Stripe, o Invoice nao tem mais um campo "subscription"
// direto - a referencia mora em invoice.parent.subscription_details.subscription.
function idDaSubscriptionDaInvoice(invoice: Stripe.Invoice): string | null {
  const subscriptionDetails = invoice.parent?.subscription_details;
  return subscriptionDetails ? idDeSubscription(subscriptionDetails.subscription) : null;
}

type StatusLocal = "trialing" | "ativa" | "atrasada" | "cancelada";

function mapearStatusStripe(status: Stripe.Subscription.Status): StatusLocal | null {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "ativa";
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "paused":
      return "atrasada";
    case "canceled":
    case "incomplete_expired":
      return "cancelada";
    default:
      return null;
  }
}

// Processa UM evento ja validado (assinatura HMAC conferida pelo caller) e ja
// confirmado como nao-duplicado (ver eventoJaProcessado). Ignora silenciosamente:
// tipos de evento que nao usamos (a Stripe manda dezenas) e subscriptions sem uma
// linha de assinatura local ainda (ex: checkout abandonado entre a Etapa 2 e a 3).
export async function processarEventoStripe(db: Database, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = idDaSubscriptionDaInvoice(invoice);
      if (!subscriptionId) return;

      await db
        .update(assinaturas)
        .set({
          status: "ativa",
          atrasadaDesde: null,
          proximaCobrancaEm: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
        })
        .where(eq(assinaturas.subscriptionIdGateway, subscriptionId));
      return;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = idDaSubscriptionDaInvoice(invoice);
      if (!subscriptionId) return;

      const [atual] = await db.select().from(assinaturas).where(eq(assinaturas.subscriptionIdGateway, subscriptionId)).limit(1);
      if (!atual) return;

      await db
        .update(assinaturas)
        .set({
          status: "atrasada",
          // So marca "atrasada desde" na PRIMEIRA falha - tentativas de cobranca
          // repetidas (retry automatico da Stripe) nao devem resetar o periodo de graca.
          atrasadaDesde: atual.status === "atrasada" ? atual.atrasadaDesde : new Date(),
        })
        .where(eq(assinaturas.id, atual.id));
      return;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const novoStatus = mapearStatusStripe(subscription.status);
      if (!novoStatus) return;

      const [atual] = await db.select().from(assinaturas).where(eq(assinaturas.subscriptionIdGateway, subscription.id)).limit(1);
      if (!atual) return;

      await db
        .update(assinaturas)
        .set({
          status: novoStatus,
          atrasadaDesde:
            novoStatus === "atrasada" ? (atual.status === "atrasada" ? atual.atrasadaDesde : new Date()) : null,
        })
        .where(eq(assinaturas.id, atual.id));
      return;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await db.update(assinaturas).set({ status: "cancelada" }).where(eq(assinaturas.subscriptionIdGateway, subscription.id));
      return;
    }

    default:
      return;
  }
}
