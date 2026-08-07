import Stripe from "stripe";
import { env } from "../config/env.js";
import { RequisicaoInvalidaError, ServicoIndisponivelError } from "./errors.js";

let clienteStripe: Stripe | null = null;

// Lazy, igual ao padrao do getAnthropicClient - so exige STRIPE_SECRET_KEY quando o
// checkout realmente precisa falar com a Stripe (nao no boot do processo).
export function obterStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new ServicoIndisponivelError("Checkout nao configurado (STRIPE_SECRET_KEY ausente)");
  }
  clienteStripe ??= new Stripe(env.STRIPE_SECRET_KEY);
  return clienteStripe;
}

const VALOR_MENSALIDADE_CENTAVOS = 69700; // R$ 697,00
const MOEDA = "brl";

export interface ResolverPriceParams {
  productId?: string;
  priceIdConfigurado?: string;
}

// Cache em memoria por processo (mesmo racional do AGENT_DEBOUNCE_MS - assume
// instancia unica) pra nao ficar consultando/criando Price a cada checkout.
const cachePrecoPorProduto = new Map<string, string>();

// Resolve o Price recorrente mensal do plano unico: usa STRIPE_PRICE_ID se
// configurado; senao procura um Price ativo compativel no Product (STRIPE_PRODUCT_ID)
// e, se nao achar nenhum, cria um na hora. "stripe" e injetavel pra testes (nunca bate
// na rede de verdade fora de producao).
export async function resolverPriceId(stripe: Stripe, params: ResolverPriceParams): Promise<string> {
  if (params.priceIdConfigurado) return params.priceIdConfigurado;
  if (!params.productId) {
    throw new ServicoIndisponivelError("Checkout nao configurado (STRIPE_PRODUCT_ID ausente)");
  }

  const cacheado = cachePrecoPorProduto.get(params.productId);
  if (cacheado) return cacheado;

  const precos = await stripe.prices.list({ product: params.productId, active: true, limit: 100 });
  const compativel = precos.data.find(
    (p) => p.recurring?.interval === "month" && p.unit_amount === VALOR_MENSALIDADE_CENTAVOS && p.currency === MOEDA,
  );
  if (compativel) {
    cachePrecoPorProduto.set(params.productId, compativel.id);
    return compativel.id;
  }

  const novo = await stripe.prices.create({
    product: params.productId,
    currency: MOEDA,
    unit_amount: VALOR_MENSALIDADE_CENTAVOS,
    recurring: { interval: "month" },
  });
  cachePrecoPorProduto.set(params.productId, novo.id);
  return novo.id;
}

export interface DadosAssinaturaTrial {
  nome: string;
  email: string;
  telefone: string;
  documento: string;
  nomeEmpresa: string;
  paymentMethodId: string;
}

export interface AssinaturaTrialCriada {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: string;
  trialEnd: number | null;
}

function mensagemDeErroStripe(err: unknown): string {
  if (err instanceof Stripe.errors.StripeCardError) {
    return err.message || "Cartao recusado. Tente outro cartao.";
  }
  if (err instanceof Stripe.errors.StripeInvalidRequestError) {
    return "Dados do pagamento invalidos. Confira o cartao e tente novamente.";
  }
  return "Nao foi possivel processar o pagamento agora. Tente novamente em instantes.";
}

// Cria o customer + subscription (com 7 dias de trial, sem cobranca imediata) na
// Stripe. Nao mexe no nosso banco - a empresa/assinatura local so e criada na Etapa 3
// (criacao de senha), que recebe os IDs devolvidos aqui. "stripe" e injetavel pra
// testes; priceId ja deve vir resolvido (ver resolverPriceId).
export async function criarAssinaturaTrial(
  stripe: Stripe,
  priceId: string,
  dados: DadosAssinaturaTrial,
): Promise<AssinaturaTrialCriada> {
  let customer: Stripe.Customer;
  try {
    customer = await stripe.customers.create({
      name: dados.nome,
      email: dados.email,
      phone: dados.telefone,
      payment_method: dados.paymentMethodId,
      invoice_settings: { default_payment_method: dados.paymentMethodId },
      metadata: { nomeEmpresa: dados.nomeEmpresa, documento: dados.documento },
    });
  } catch (err) {
    throw new RequisicaoInvalidaError(mensagemDeErroStripe(err));
  }

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      trial_period_days: 7,
    });
  } catch (err) {
    // Rede de seguranca: sem isso, uma falha aqui deixaria um customer orfao (sem
    // assinatura nenhuma) parado na Stripe.
    await stripe.customers.del(customer.id).catch(() => {});
    throw new RequisicaoInvalidaError(mensagemDeErroStripe(err));
  }

  return {
    stripeCustomerId: customer.id,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    trialEnd: subscription.trial_end,
  };
}

export interface DadosAssinaturaUnidadeAdicional {
  customerId: string;
  paymentMethodId: string;
}

// Fluxo "adicionar unidade" (doc 17, parte 3): mesma logica de criarAssinaturaTrial
// acima, mas reaproveitando o customer JA existente da empresa (empresas.
// stripeCustomerId) em vez de criar um novo - evita duplicar cliente no gateway
// quando o dono adiciona uma segunda/terceira loja. Sempre um subscription NOVO
// (uma unidade = uma assinatura), com seu proprio trial de 7 dias independente.
export async function criarAssinaturaTrialParaUnidadeAdicional(
  stripe: Stripe,
  priceId: string,
  dados: DadosAssinaturaUnidadeAdicional,
): Promise<AssinaturaTrialCriada> {
  try {
    await stripe.paymentMethods.attach(dados.paymentMethodId, { customer: dados.customerId });
    await stripe.customers.update(dados.customerId, {
      invoice_settings: { default_payment_method: dados.paymentMethodId },
    });
  } catch (err) {
    throw new RequisicaoInvalidaError(mensagemDeErroStripe(err));
  }

  try {
    const subscription = await stripe.subscriptions.create({
      customer: dados.customerId,
      items: [{ price: priceId }],
      trial_period_days: 7,
      default_payment_method: dados.paymentMethodId,
    });
    return {
      stripeCustomerId: dados.customerId,
      stripeSubscriptionId: subscription.id,
      status: subscription.status,
      trialEnd: subscription.trial_end,
    };
  } catch (err) {
    throw new RequisicaoInvalidaError(mensagemDeErroStripe(err));
  }
}
