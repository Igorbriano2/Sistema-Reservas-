import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type Stripe from "stripe";
import { db } from "../../db/client.js";
import { usuarios } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { env } from "../../config/env.js";
import { RequisicaoInvalidaError } from "../../lib/errors.js";
import { criarAssinaturaTrial, obterStripe, resolverPriceId } from "../../lib/stripe.js";
import { provisionarContaAposPagamento } from "../../lib/checkout.js";
import { eventoJaProcessado, processarEventoStripe } from "../../lib/stripe-webhook.js";

// Rotas PUBLICAS (sem requireAuth) do assistente de checkout/assinatura (/assinar no
// frontend) - ver doc da Etapa 1 (dados cadastrais), Etapa 2 (pagamento) e Etapa 3
// (criacao de senha + provisionamento da empresa). A Etapa 4 (login automatico) e so
// frontend - reaproveita o /auth/login normal com o e-mail/senha desta etapa. O
// webhook (eventos de cobranca) tambem mora aqui, ja que e a mesma area publica.
export const checkoutRouter = Router();

const validarEmailSchema = z.object({ email: z.string().trim().email() });

async function emailJaEstaEmUso(email: string): Promise<boolean> {
  const [existente] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.email, email.toLowerCase()))
    .limit(1);
  return !!existente;
}

checkoutRouter.post(
  "/validar-email",
  asyncHandler(async (req, res) => {
    const { email } = validarEmailSchema.parse(req.body);
    res.json({ disponivel: !(await emailJaEstaEmUso(email)) });
  }),
);

const assinarSchema = z.object({
  nome: z.string().trim().min(1),
  telefone: z.string().trim().min(8),
  email: z.string().trim().email(),
  documento: z.string().trim().min(11),
  nomeEmpresa: z.string().trim().min(1),
  // Gerado no navegador via Stripe Elements (stripe.createPaymentMethod) - o numero
  // do cartao em si NUNCA chega neste backend, so esse token de curta duracao.
  paymentMethodId: z.string().trim().min(1),
});

checkoutRouter.post(
  "/assinar",
  asyncHandler(async (req, res) => {
    const dados = assinarSchema.parse(req.body);
    const email = dados.email.toLowerCase();

    // Reconfirma disponibilidade do e-mail antes de criar qualquer coisa na Stripe
    // (protege contra a corrida de duas abas enviando a Etapa 1 quase juntas).
    if (await emailJaEstaEmUso(email)) {
      throw new RequisicaoInvalidaError(`Ja existe uma conta com o e-mail ${email}`);
    }

    const stripe = obterStripe();
    const priceId = await resolverPriceId(stripe, {
      productId: env.STRIPE_PRODUCT_ID,
      priceIdConfigurado: env.STRIPE_PRICE_ID,
    });

    const resultado = await criarAssinaturaTrial(stripe, priceId, { ...dados, email });
    res.status(201).json(resultado);
  }),
);

const criarContaSchema = z.object({
  nome: z.string().trim().min(1),
  telefone: z.string().trim().min(8),
  email: z.string().trim().email(),
  documento: z.string().trim().min(11),
  nomeEmpresa: z.string().trim().min(1),
  senha: z.string().min(8, "senha deve ter pelo menos 8 caracteres"),
  // Devolvidos pela Etapa 2 (/assinar) - reconfirmados aqui direto na Stripe antes de
  // criar qualquer coisa no nosso banco, pra ninguem conseguir provisionar uma
  // empresa so inventando esses dois IDs sem ter pago nada de verdade.
  stripeCustomerId: z.string().trim().min(1),
  stripeSubscriptionId: z.string().trim().min(1),
});

checkoutRouter.post(
  "/criar-conta",
  asyncHandler(async (req, res) => {
    const dados = criarContaSchema.parse(req.body);
    const stripe = obterStripe();
    const resultado = await provisionarContaAposPagamento(db, stripe, { ...dados, email: dados.email.toLowerCase() });
    res.status(201).json(resultado);
  }),
);

// Registrado no dashboard da Stripe (Developers > Webhooks) apontando pra esta URL -
// ver STRIPE_WEBHOOK_SECRET em env.ts. Usa req.rawBody (capturado globalmente no
// verify() do express.json() em app.ts) pra validar a assinatura Stripe-Signature.
checkoutRouter.post(
  "/webhook",
  asyncHandler(async (req, res) => {
    const assinatura = req.header("stripe-signature");
    if (!env.STRIPE_WEBHOOK_SECRET || !assinatura) {
      res.sendStatus(400);
      return;
    }

    const stripe = obterStripe();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody ?? Buffer.from(""), assinatura, env.STRIPE_WEBHOOK_SECRET);
    } catch {
      res.status(400).json({ error: "Assinatura invalida" });
      return;
    }

    if (await eventoJaProcessado(db, event)) {
      res.json({ recebido: true, duplicado: true });
      return;
    }

    await processarEventoStripe(db, event);
    res.json({ recebido: true });
  }),
);
