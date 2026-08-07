import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { criarAssinaturaTrial, criarAssinaturaTrialParaUnidadeAdicional, criarDepositoDeReserva, resolverPriceId } from "../src/lib/stripe.js";
import { RequisicaoInvalidaError, ServicoIndisponivelError } from "../src/lib/errors.js";

// Fake minimo do client da Stripe - so implementa os metodos que lib/stripe.ts usa,
// injetado nas funcoes (mesmo padrao do MessagesCreateFn do orquestrador do agente)
// pra nunca bater na rede de verdade nos testes.
function criarStripeFalso(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    customers: {
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      del: vi.fn().mockResolvedValue({ id: "cus_deletado", deleted: true }),
    },
    subscriptions: {
      create: vi.fn(),
    },
    paymentMethods: {
      attach: vi.fn().mockResolvedValue({}),
    },
    prices: {
      list: vi.fn(),
      create: vi.fn(),
    },
    paymentIntents: {
      create: vi.fn(),
    },
    ...overrides,
  } as unknown as Stripe;
}

const DADOS_BASE = {
  nome: "Maria Silva",
  email: "maria@restaurante.com",
  telefone: "11912345678",
  documento: "11144477735",
  nomeEmpresa: "Restaurante da Maria",
  paymentMethodId: "pm_fake_123",
};

describe("criarAssinaturaTrial", () => {
  it("cria customer + subscription com trial de 7 dias e devolve os IDs", async () => {
    const stripe = criarStripeFalso();
    (stripe.customers.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "cus_123" });
    (stripe.subscriptions.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "sub_123",
      status: "trialing",
      trial_end: 1234567890,
    });

    const resultado = await criarAssinaturaTrial(stripe, "price_123", DADOS_BASE);

    expect(resultado).toEqual({
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
      status: "trialing",
      trialEnd: 1234567890,
    });
    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_123", trial_period_days: 7, items: [{ price: "price_123" }] }),
    );
  });

  it("apaga o customer orfao se a criacao da subscription falhar", async () => {
    const stripe = criarStripeFalso();
    (stripe.customers.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "cus_456" });
    (stripe.subscriptions.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("falha generica"));

    await expect(criarAssinaturaTrial(stripe, "price_123", DADOS_BASE)).rejects.toBeInstanceOf(RequisicaoInvalidaError);

    expect(stripe.customers.del).toHaveBeenCalledWith("cus_456");
  });

  it("propaga erro amigavel quando a criacao do customer falha (ex: cartao recusado)", async () => {
    const stripe = criarStripeFalso();
    (stripe.customers.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("cartao invalido"));

    await expect(criarAssinaturaTrial(stripe, "price_123", DADOS_BASE)).rejects.toBeInstanceOf(RequisicaoInvalidaError);
    // Sem customer criado, no del nao deve ser chamado.
    expect(stripe.customers.del).not.toHaveBeenCalled();
  });
});

describe("criarAssinaturaTrialParaUnidadeAdicional", () => {
  it("anexa o cartao ao customer JA EXISTENTE (sem criar outro) e cria uma nova subscription com trial de 7 dias", async () => {
    const stripe = criarStripeFalso();
    (stripe.subscriptions.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "sub_unidade_2",
      status: "trialing",
      trial_end: 1999999999,
    });

    const resultado = await criarAssinaturaTrialParaUnidadeAdicional(stripe, "price_123", {
      customerId: "cus_existente",
      paymentMethodId: "pm_fake_456",
    });

    expect(stripe.paymentMethods.attach).toHaveBeenCalledWith("pm_fake_456", { customer: "cus_existente" });
    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existente", trial_period_days: 7, items: [{ price: "price_123" }] }),
    );
    expect(resultado).toEqual({
      stripeCustomerId: "cus_existente",
      stripeSubscriptionId: "sub_unidade_2",
      status: "trialing",
      trialEnd: 1999999999,
    });
  });

  it("propaga erro amigavel quando o cartao e recusado ao anexar", async () => {
    const stripe = criarStripeFalso({ paymentMethods: { attach: vi.fn().mockRejectedValue(new Error("cartao recusado")) } });

    await expect(
      criarAssinaturaTrialParaUnidadeAdicional(stripe, "price_123", { customerId: "cus_existente", paymentMethodId: "pm_ruim" }),
    ).rejects.toBeInstanceOf(RequisicaoInvalidaError);
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
  });

  it("propaga erro amigavel quando a criacao da subscription falha", async () => {
    const stripe = criarStripeFalso();
    (stripe.subscriptions.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("falha generica"));

    await expect(
      criarAssinaturaTrialParaUnidadeAdicional(stripe, "price_123", { customerId: "cus_existente", paymentMethodId: "pm_fake" }),
    ).rejects.toBeInstanceOf(RequisicaoInvalidaError);
  });
});

describe("criarDepositoDeReserva (doc 22)", () => {
  it("cria o PaymentIntent com o valor/metadata informados e devolve id + clientSecret", async () => {
    const stripe = criarStripeFalso();
    (stripe.paymentIntents.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "pi_123",
      client_secret: "pi_123_secret_abc",
    });

    const resultado = await criarDepositoDeReserva(stripe, {
      valorCentavos: 5000,
      metadata: { unidadeId: "unidade-1", igSenderId: "sender-1", data: "2026-10-10", horaInicio: "19:00" },
    });

    expect(resultado).toEqual({ paymentIntentId: "pi_123", clientSecret: "pi_123_secret_abc" });
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 5000,
        currency: "brl",
        metadata: { unidadeId: "unidade-1", igSenderId: "sender-1", data: "2026-10-10", horaInicio: "19:00" },
      }),
    );
  });

  it("traduz erro da Stripe em RequisicaoInvalidaError", async () => {
    const stripe = criarStripeFalso();
    (stripe.paymentIntents.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("falha generica"));

    await expect(criarDepositoDeReserva(stripe, { valorCentavos: 5000, metadata: {} })).rejects.toBeInstanceOf(RequisicaoInvalidaError);
  });
});

describe("resolverPriceId", () => {
  it("usa o priceIdConfigurado direto, sem chamar a Stripe", async () => {
    const stripe = criarStripeFalso();
    const id = await resolverPriceId(stripe, { priceIdConfigurado: "price_fixo" });
    expect(id).toBe("price_fixo");
    expect(stripe.prices.list).not.toHaveBeenCalled();
  });

  it("rejeita se nao ha priceIdConfigurado nem productId", async () => {
    const stripe = criarStripeFalso();
    await expect(resolverPriceId(stripe, {})).rejects.toBeInstanceOf(ServicoIndisponivelError);
  });

  it("reaproveita um Price existente compativel (R$697/mes) em vez de criar outro", async () => {
    const stripe = criarStripeFalso();
    (stripe.prices.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: "price_existente", recurring: { interval: "month" }, unit_amount: 69700, currency: "brl" }],
    });

    const id = await resolverPriceId(stripe, { productId: `prod_test_${Date.now()}_a` });
    expect(id).toBe("price_existente");
    expect(stripe.prices.create).not.toHaveBeenCalled();
  });

  it("cria um novo Price quando nenhum compativel existe, e cacheia pra proxima chamada", async () => {
    const stripe = criarStripeFalso();
    (stripe.prices.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (stripe.prices.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "price_novo" });

    const productId = `prod_test_${Date.now()}_b`;
    const id1 = await resolverPriceId(stripe, { productId });
    expect(id1).toBe("price_novo");
    expect(stripe.prices.create).toHaveBeenCalledTimes(1);

    const id2 = await resolverPriceId(stripe, { productId });
    expect(id2).toBe("price_novo");
    // Segunda chamada usa o cache em memoria - nao bate na Stripe de novo.
    expect(stripe.prices.list).toHaveBeenCalledTimes(1);
    expect(stripe.prices.create).toHaveBeenCalledTimes(1);
  });
});
