import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { assinaturas, empresas, unidades } from "../src/db/schema/index.js";
import { adicionarUnidadeComAssinatura } from "../src/lib/unidades.js";
import { RequisicaoInvalidaError } from "../src/lib/errors.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

// Mesmo padrao de fake do tests/stripe.test.ts.
function criarStripeFalso() {
  return {
    paymentMethods: { attach: vi.fn().mockResolvedValue({}) },
    customers: { update: vi.fn().mockResolvedValue({}) },
    subscriptions: {
      create: vi.fn().mockResolvedValue({ id: "sub_unidade_nova", status: "trialing", trial_end: 1999999999 }),
    },
  } as unknown as Stripe;
}

const DADOS_UNIDADE = { nome: "Cervegela Maringa", endereco: "Av. Brasil, 100", paymentMethodId: "pm_fake_nova" };

describe("adicionarUnidadeComAssinatura (doc 17, parte 3)", () => {
  it("reaproveita o customer JA existente da empresa e cria uma nova assinatura/trial pra unidade nova", async () => {
    const { empresa } = await criarEmpresaComAdmin();
    await db.update(empresas).set({ stripeCustomerId: "cus_existente_da_empresa" }).where(eq(empresas.id, empresa.id));

    const stripe = criarStripeFalso();
    const { unidade } = await adicionarUnidadeComAssinatura(db, stripe, "price_123", empresa.id, DADOS_UNIDADE);

    expect(unidade.nome).toBe("Cervegela Maringa");
    expect(unidade.empresaId).toBe(empresa.id);
    expect(stripe.paymentMethods.attach).toHaveBeenCalledWith("pm_fake_nova", { customer: "cus_existente_da_empresa" });
    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existente_da_empresa" }),
    );

    const [assinatura] = await db.select().from(assinaturas).where(eq(assinaturas.unidadeId, unidade.id));
    expect(assinatura.customerIdGateway).toBe("cus_existente_da_empresa");
    expect(assinatura.subscriptionIdGateway).toBe("sub_unidade_nova");
    expect(assinatura.status).toBe("trialing");
    expect(assinatura.empresaId).toBe(empresa.id);
  });

  it("nao cria uma segunda unidade nem assinatura quando a empresa ainda nao tem stripeCustomerId", async () => {
    const { empresa } = await criarEmpresaComAdmin();
    // empresa sem stripeCustomerId (nunca passou pelo checkout com pagamento real).

    const stripe = criarStripeFalso();
    await expect(adicionarUnidadeComAssinatura(db, stripe, "price_123", empresa.id, DADOS_UNIDADE)).rejects.toBeInstanceOf(
      RequisicaoInvalidaError,
    );

    const unidadesDaEmpresa = await db.select().from(unidades).where(eq(unidades.empresaId, empresa.id));
    // So a unidade original (criada por criarEmpresaComAdmin) - nenhuma nova.
    expect(unidadesDaEmpresa).toHaveLength(1);
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
  });
});
