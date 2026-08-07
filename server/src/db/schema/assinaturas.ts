import { pgTable, uuid, text, timestamp, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
import { empresas } from "./empresas.js";

// So Stripe por enquanto - o enum existe pra deixar explicito que outro gateway
// poderia entrar aqui no futuro sem migrar dado antigo.
export const assinaturaGatewayEnum = pgEnum("assinatura_gateway", ["stripe"]);

// Status AUTOMATICO, dirigido pelos eventos de webhook da Stripe (ver lib/stripe-webhook.ts) -
// distinto de empresas.assinatura_status, que e o status MANUAL que o dono da
// plataforma edita a mao no /painel. Os dois convivem: o campo manual funciona como
// override/excecao (ex: suspender por abuso mesmo com assinatura ativa na Stripe) e
// SEMPRE vence, e o middleware de acesso (middleware/assinatura.middleware.ts) checa
// os dois - nunca escrevemos em empresas.assinatura_status automaticamente, esse
// campo fica 100% sob controle manual do dono da plataforma.
export const assinaturaStatusGatewayEnum = pgEnum("assinatura_status_gateway", [
  "trialing",
  "ativa",
  "atrasada",
  "cancelada",
]);

export const assinaturas = pgTable(
  "assinaturas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    gateway: assinaturaGatewayEnum("gateway").notNull().default("stripe"),
    customerIdGateway: text("customer_id_gateway").notNull(),
    subscriptionIdGateway: text("subscription_id_gateway").notNull(),
    status: assinaturaStatusGatewayEnum("status").notNull().default("trialing"),
    trialTerminaEm: timestamp("trial_termina_em", { withTimezone: true }),
    proximaCobrancaEm: timestamp("proxima_cobranca_em", { withTimezone: true }),
    // Preenchido so quando o status vira "atrasada" pela primeira vez (nao reseta em
    // tentativas de cobranca repetidas) - o middleware de acesso usa isso pra calcular
    // o periodo de graca antes de bloquear.
    atrasadaDesde: timestamp("atrasada_desde", { withTimezone: true }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("assinaturas_empresa_id_idx").on(table.empresaId),
    // Garante que o mesmo subscription da Stripe nunca vira duas linhas aqui -
    // tambem serve de protecao contra reuso indevido do mesmo ID por outro checkout.
    uniqueIndex("assinaturas_subscription_id_gateway_idx").on(table.subscriptionIdGateway),
  ],
);

export type Assinatura = typeof assinaturas.$inferSelect;
export type NovaAssinatura = typeof assinaturas.$inferInsert;
