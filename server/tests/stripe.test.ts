import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { criarAssinaturaTrial, resolverPriceId } from "../src/lib/stripe.js";
import { RequisicaoInvalidaError, ServicoIndisponivelError } from "../src/lib/errors.js";

// Fake minimo do client da Stripe - so implementa os metodos que lib/stripe.ts usa,
// injetado nas funcoes (mesmo padrao do MessagesCreateFn do orquestrador do agente)
// pra nunca bater na rede de verdade nos testes.
function criarStripeFalso(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    customers: {
      create: vi.fn(),
      del: vi.fn().mockResolvedValue({ id: "cus_deletado", deleted: true }),
    },
    subscriptions: {
      create: vi.fn(),
    },
    prices: {
      list: vi.fn(),
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
