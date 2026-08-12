import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { assinaturas, empresas, usuarios } from "../src/db/schema/index.js";
import { provisionarContaAposPagamento } from "../src/lib/checkout.js";
import { criarEmpresaComOwner } from "../src/lib/empresas.js";
import { RequisicaoInvalidaError } from "../src/lib/errors.js";
import { closeDb, truncateAll } from "./helpers/db.js";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

// Mesmo padrao de fake do tests/stripe.test.ts - so implementa o que
// provisionarContaAposPagamento usa (subscriptions.retrieve).
function criarStripeFalso(subscription: unknown) {
  return {
    subscriptions: {
      retrieve: vi.fn().mockResolvedValue(subscription),
    },
  } as unknown as Stripe;
}

const DADOS_BASE = {
  nome: "Maria Silva",
  email: "maria-etapa3@teste.com",
  username: "maria.silva",
  telefone: "11912345678",
  documento: "11144477735",
  nomeEmpresa: "Restaurante da Maria",
  senha: "senhaDaMaria123",
  stripeCustomerId: "cus_valido",
  stripeSubscriptionId: "sub_valido",
};

describe("provisionarContaAposPagamento", () => {
  it("cria empresa + owner + linha de assinatura quando a subscription e valida (trialing)", async () => {
    const stripe = criarStripeFalso({
      id: "sub_valido",
      customer: "cus_valido",
      status: "trialing",
      trial_end: 1999999999,
    });

    const { empresaId } = await provisionarContaAposPagamento(db, stripe, DADOS_BASE);
    expect(empresaId).toBeTruthy();

    const [owner] = await db.select().from(usuarios).where(eq(usuarios.email, DADOS_BASE.email));
    expect(owner.papel).toBe("owner");
    expect(owner.empresaId).toBe(empresaId);

    const [assinatura] = await db.select().from(assinaturas).where(eq(assinaturas.empresaId, empresaId));
    expect(assinatura.subscriptionIdGateway).toBe("sub_valido");
    expect(assinatura.customerIdGateway).toBe("cus_valido");
    expect(assinatura.status).toBe("trialing");
    expect(assinatura.trialTerminaEm).toEqual(new Date(1999999999 * 1000));
  });

  it("aceita subscription com status active (ja passou do trial) e grava status ativa", async () => {
    const stripe = criarStripeFalso({ id: "sub_valido", customer: "cus_valido", status: "active", trial_end: null });

    const { empresaId } = await provisionarContaAposPagamento(db, stripe, DADOS_BASE);
    const [assinatura] = await db.select().from(assinaturas).where(eq(assinaturas.empresaId, empresaId));
    expect(assinatura.status).toBe("ativa");
    expect(assinatura.trialTerminaEm).toBeNull();
  });

  it("rejeita quando o customerId nao bate com o da subscription, sem criar empresa", async () => {
    const stripe = criarStripeFalso({ id: "sub_valido", customer: "cus_outro_completamente_diferente", status: "trialing" });

    await expect(provisionarContaAposPagamento(db, stripe, DADOS_BASE)).rejects.toBeInstanceOf(RequisicaoInvalidaError);

    const [empresa] = await db.select().from(empresas).where(eq(empresas.nome, DADOS_BASE.nomeEmpresa));
    expect(empresa).toBeUndefined();
  });

  it("rejeita quando a subscription nao existe na Stripe, sem criar empresa", async () => {
    const stripe = { subscriptions: { retrieve: vi.fn().mockRejectedValue(new Error("nao existe")) } } as unknown as Stripe;

    await expect(provisionarContaAposPagamento(db, stripe, DADOS_BASE)).rejects.toBeInstanceOf(RequisicaoInvalidaError);

    const [empresa] = await db.select().from(empresas).where(eq(empresas.nome, DADOS_BASE.nomeEmpresa));
    expect(empresa).toBeUndefined();
  });

  it("rejeita quando a subscription ja foi cancelada, sem criar empresa", async () => {
    const stripe = criarStripeFalso({ id: "sub_valido", customer: "cus_valido", status: "canceled" });

    await expect(provisionarContaAposPagamento(db, stripe, DADOS_BASE)).rejects.toBeInstanceOf(RequisicaoInvalidaError);

    const [empresa] = await db.select().from(empresas).where(eq(empresas.nome, DADOS_BASE.nomeEmpresa));
    expect(empresa).toBeUndefined();
  });

  it("se a linha de assinatura nao puder ser gravada (subscription_id duplicado), desfaz empresa/usuario/unidade tambem", async () => {
    // Simula o cenario do achado de seguranca: sem a transacao, uma falha aqui deixava
    // empresa/usuario criados MAS sem assinatura local - e o middleware de acesso trata
    // "sem linha de assinatura" como acesso liberado, ou seja, a unidade ficava com uso
    // gratis ilimitado sem ninguem notar. Forca a mesma falha (unique constraint em
    // subscription_id_gateway) pre-inserindo uma linha com o MESMO id de subscription
    // que DADOS_BASE vai tentar usar, numa empresa/unidade descartavel.
    const { empresa: empresaAlheia, unidade: unidadeAlheia } = await criarEmpresaComOwner(db, {
      nomeEmpresa: "Empresa alheia",
      ownerNome: "Dono Alheio",
      ownerEmail: "dono-alheio@teste.com",
      ownerSenha: "senhaQualquer123",
    });
    await db.insert(assinaturas).values({
      empresaId: empresaAlheia.id,
      unidadeId: unidadeAlheia.id,
      customerIdGateway: "cus_outro",
      subscriptionIdGateway: DADOS_BASE.stripeSubscriptionId,
      status: "ativa",
    });

    const stripe = criarStripeFalso({ id: DADOS_BASE.stripeSubscriptionId, customer: DADOS_BASE.stripeCustomerId, status: "trialing" });

    await expect(provisionarContaAposPagamento(db, stripe, DADOS_BASE)).rejects.toThrow();

    // Nem empresa, nem usuario "orfaos" (sem assinatura) devem sobrar - tudo foi
    // desfeito pela transacao junto com a falha na assinatura.
    const [empresaOrfa] = await db.select().from(empresas).where(eq(empresas.nome, DADOS_BASE.nomeEmpresa));
    expect(empresaOrfa).toBeUndefined();
    const [usuarioOrfao] = await db.select().from(usuarios).where(eq(usuarios.email, DADOS_BASE.email));
    expect(usuarioOrfao).toBeUndefined();
  });

  it("nao permite reaproveitar o mesmo e-mail de um usuario ja existente", async () => {
    const stripe = criarStripeFalso({ id: "sub_valido", customer: "cus_valido", status: "trialing" });
    await provisionarContaAposPagamento(db, stripe, DADOS_BASE);

    const stripe2 = criarStripeFalso({ id: "sub_outra", customer: "cus_outro", status: "trialing" });
    await expect(
      provisionarContaAposPagamento(db, stripe2, { ...DADOS_BASE, stripeCustomerId: "cus_outro", stripeSubscriptionId: "sub_outra" }),
    ).rejects.toThrow();
  });
});
