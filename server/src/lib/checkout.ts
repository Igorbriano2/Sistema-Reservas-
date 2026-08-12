import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import type { Database } from "../db/client.js";
import { assinaturas, empresas, type Assinatura } from "../db/schema/index.js";
import { RecursoNaoEncontradoError, RequisicaoInvalidaError } from "./errors.js";
import { criarEmpresaComOwner } from "./empresas.js";

export interface DadosCriarConta {
  nome: string;
  email: string;
  username: string;
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

  // Tudo numa unica transacao: sem isso, uma falha ao gravar a linha de assinatura
  // (por qualquer motivo - subscription reaproveitada, erro transitorio de banco)
  // deixava empresa/usuario/unidade ja criados, mas SEM assinatura local - e
  // requireAssinaturaDaUnidadeAtiva trata "sem linha de assinatura" como "libera"
  // (ver assinatura.middleware.ts), entao a unidade ficava com acesso gratis
  // ilimitado silenciosamente, sem ninguem notar. Agora, se a assinatura nao puder
  // ser gravada, empresa/usuario/unidade tambem sao desfeitos e o cliente recebe um
  // erro claro pra tentar de novo (a subscription na Stripe continua valida, entao
  // repetir a Etapa 3 funciona sem cobrar duas vezes).
  const { empresa } = await db.transaction(async (tx) => {
    const { empresa, unidade } = await criarEmpresaComOwner(tx, {
      nomeEmpresa: dados.nomeEmpresa,
      ownerNome: dados.nome,
      ownerEmail: dados.email,
      ownerUsername: dados.username,
      ownerSenha: dados.senha,
      plano: "trial",
    });

    // Guarda o customer da Stripe na empresa pra reaproveitar (sem duplicar cliente no
    // gateway) quando uma segunda unidade for adicionada depois (doc 17).
    await tx.update(empresas).set({ stripeCustomerId: customerId }).where(eq(empresas.id, empresa.id));

    await tx.insert(assinaturas).values({
      empresaId: empresa.id,
      unidadeId: unidade.id,
      gateway: "stripe",
      customerIdGateway: customerId,
      subscriptionIdGateway: subscription.id,
      status: subscription.status === "trialing" ? "trialing" : "ativa",
      trialTerminaEm: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    });

    return { empresa, unidade };
  });

  return { empresaId: empresa.id };
}

// So durante o trial: cancela na Stripe sem gerar cobranca nenhuma. Depois do trial
// (status "ativa"/"atrasada"), o cancelamento self-service fica fora de escopo por
// enquanto - o dono precisa falar com o suporte. "obterStripeClient" e uma funcao (nao
// um client ja resolvido) de proposito: so precisamos de STRIPE_SECRET_KEY configurada
// quando o cancelamento realmente vai acontecer, depois das validacoes acima - assim
// "sem assinatura"/"nao esta mais em trial" nunca esbarram num erro de configuracao
// que nem chegaria a usar a Stripe. Injetavel pra testes (passa uma funcao fake).
export async function cancelarAssinaturaDoTrial(
  db: Database,
  obterStripeClient: () => Stripe,
  empresaId: string,
): Promise<Assinatura> {
  const [assinatura] = await db.select().from(assinaturas).where(eq(assinaturas.empresaId, empresaId)).limit(1);
  if (!assinatura) {
    throw new RecursoNaoEncontradoError("Nenhuma assinatura encontrada para esta empresa");
  }
  if (assinatura.status !== "trialing") {
    throw new RequisicaoInvalidaError(
      "Cancelamento automatico so esta disponivel durante o periodo de teste gratis. Fale com o suporte.",
    );
  }

  const stripe = obterStripeClient();
  await stripe.subscriptions.cancel(assinatura.subscriptionIdGateway);

  const [atualizada] = await db
    .update(assinaturas)
    .set({ status: "cancelada" })
    .where(eq(assinaturas.id, assinatura.id))
    .returning();

  return atualizada;
}
