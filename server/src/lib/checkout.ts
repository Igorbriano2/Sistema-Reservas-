import type Stripe from "stripe";
import type { Database } from "../db/client.js";
import { assinaturas } from "../db/schema/index.js";
import { RequisicaoInvalidaError } from "./errors.js";
import { criarEmpresaComOwner } from "./empresas.js";

export interface DadosCriarConta {
  nome: string;
  email: string;
  telefone: string;
  documento: string;
  nomeEmpresa: string;
  senha: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
}

// Etapa 3 do assistente de assinatura: reconfirma a subscription direto na Stripe
// (evita provisionar empresa pra quem so inventou os IDs devolvidos pela Etapa 2, sem
// ter pago nada de verdade) e so entao cria empresa+unidade+owner+assinatura local.
// "stripe" e injetavel pra testes, igual ao resto de lib/stripe.ts.
export async function provisionarContaAposPagamento(
  db: Database,
  stripe: Stripe,
  dados: DadosCriarConta,
): Promise<{ empresaId: string }> {
  const subscription = await stripe.subscriptions.retrieve(dados.stripeSubscriptionId).catch(() => null);
  if (!subscription) {
    throw new RequisicaoInvalidaError("Assinatura nao encontrada. Refaca o pagamento e tente novamente.");
  }

  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (customerId !== dados.stripeCustomerId) {
    throw new RequisicaoInvalidaError("Dados do pagamento nao conferem. Refaca o pagamento e tente novamente.");
  }
  if (subscription.status !== "trialing" && subscription.status !== "active") {
    throw new RequisicaoInvalidaError("Esta assinatura nao esta mais valida. Refaca o pagamento e tente novamente.");
  }

  const { empresa } = await criarEmpresaComOwner(db, {
    nomeEmpresa: dados.nomeEmpresa,
    ownerNome: dados.nome,
    ownerEmail: dados.email,
    ownerSenha: dados.senha,
    plano: "trial",
  });

  try {
    await db.insert(assinaturas).values({
      empresaId: empresa.id,
      gateway: "stripe",
      customerIdGateway: customerId,
      subscriptionIdGateway: subscription.id,
      status: subscription.status === "trialing" ? "trialing" : "ativa",
      trialTerminaEm: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    });
  } catch (err) {
    // O login do dono ja funciona mesmo se isso falhar (empresa/usuario ja foram
    // criados acima) - so registra pra investigar (ex: subscription reaproveitada).
    console.error(`[checkout] falha ao gravar assinatura da empresa ${empresa.id}:`, err);
  }

  return { empresaId: empresa.id };
}
