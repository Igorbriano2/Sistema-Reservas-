import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { usuarios } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { env } from "../../config/env.js";
import { RequisicaoInvalidaError } from "../../lib/errors.js";
import { criarAssinaturaTrial, obterStripe, resolverPriceId } from "../../lib/stripe.js";

// Rotas PUBLICAS (sem requireAuth) do assistente de checkout/assinatura (/assinar no
// frontend) - ver doc da Etapa 1 (dados cadastrais) e Etapa 2 (pagamento). A Etapa 3
// (criacao de senha + provisionamento da empresa) entra no proximo passo.
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
