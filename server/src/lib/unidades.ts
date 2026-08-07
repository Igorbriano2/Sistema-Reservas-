import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import type { Database } from "../db/client.js";
import { assinaturas, empresas, unidades, type Unidade } from "../db/schema/index.js";
import { RequisicaoInvalidaError } from "./errors.js";
import { criarAssinaturaTrialParaUnidadeAdicional } from "./stripe.js";

export interface DadosNovaUnidade {
  nome: string;
  endereco?: string;
  timezone?: string;
  paymentMethodId: string;
}

// Fluxo "adicionar unidade" (doc 17, parte 3): owner ja autenticado, empresa ja tem
// stripeCustomerId (setado no checkout inicial) - reaproveita esse customer pra criar
// uma NOVA subscription (uma unidade = uma assinatura, cada uma com seu proprio trial
// de 7 dias independente), sem duplicar cliente no gateway. priceId ja deve vir
// resolvido (ver resolverPriceId) - mesmo padrao de criarAssinaturaTrial, pra manter a
// resolucao de preco como responsabilidade da rota, nao desta funcao.
export async function adicionarUnidadeComAssinatura(
  db: Database,
  stripe: Stripe,
  priceId: string,
  empresaId: string,
  dados: DadosNovaUnidade,
): Promise<{ unidade: Unidade }> {
  const [empresa] = await db.select().from(empresas).where(eq(empresas.id, empresaId)).limit(1);
  if (!empresa) {
    throw new RequisicaoInvalidaError("Empresa nao encontrada");
  }
  if (!empresa.stripeCustomerId) {
    throw new RequisicaoInvalidaError(
      "Esta empresa ainda nao tem um cliente de pagamento configurado. Fale com o suporte.",
    );
  }

  const resultado = await criarAssinaturaTrialParaUnidadeAdicional(stripe, priceId, {
    customerId: empresa.stripeCustomerId,
    paymentMethodId: dados.paymentMethodId,
  });

  const [unidade] = await db
    .insert(unidades)
    .values({
      empresaId,
      nome: dados.nome,
      endereco: dados.endereco ?? null,
      timezone: dados.timezone ?? "America/Sao_Paulo",
    })
    .returning();

  try {
    await db.insert(assinaturas).values({
      empresaId,
      unidadeId: unidade.id,
      gateway: "stripe",
      customerIdGateway: resultado.stripeCustomerId,
      subscriptionIdGateway: resultado.stripeSubscriptionId,
      status: resultado.status === "trialing" ? "trialing" : "ativa",
      trialTerminaEm: resultado.trialEnd ? new Date(resultado.trialEnd * 1000) : null,
    });
  } catch (err) {
    // A unidade ja foi criada e ja tem assinatura ativa na Stripe mesmo se isso
    // falhar - so registra pra investigar (mesmo padrao de lib/checkout.ts).
    console.error(`[unidades] falha ao gravar assinatura da unidade ${unidade.id}:`, err);
  }

  return { unidade };
}
