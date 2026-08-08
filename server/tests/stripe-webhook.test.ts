import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { assinaturas, stripeWebhookEventos } from "../src/db/schema/index.js";
import { eventoJaProcessado, processarEventoStripe, processarEventoWebhookStripe } from "../src/lib/stripe-webhook.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
import { criarAssinatura } from "./helpers/fixtures.js";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

function eventoFalso(id: string, type: string, object: unknown): Stripe.Event {
  return { id, type, data: { object } } as unknown as Stripe.Event;
}

function invoiceFalsa(subscriptionId: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    parent: { subscription_details: { subscription: subscriptionId } },
    period_end: 1999999999,
    ...overrides,
  };
}

describe("eventoJaProcessado (idempotencia)", () => {
  it("a primeira vez retorna false, a segunda (mesmo id) retorna true", async () => {
    const evento = eventoFalso("evt_123", "invoice.payment_succeeded", {});
    expect(await eventoJaProcessado(db, evento)).toBe(false);
    expect(await eventoJaProcessado(db, evento)).toBe(true);
  });
});

describe("processarEventoStripe", () => {
  it("invoice.payment_succeeded marca a assinatura como ativa e limpa atrasada_desde", async () => {
    const { empresa, unidade } = await criarEmpresaComAdmin();
    const assinatura = await criarAssinatura(empresa.id, unidade.id, {
      status: "atrasada",
      atrasadaDesde: new Date(),
      subscriptionIdGateway: "sub_abc",
    });

    await processarEventoStripe(db, eventoFalso("evt_1", "invoice.payment_succeeded", invoiceFalsa("sub_abc")));

    const [atualizada] = await db.select().from(assinaturas).where(eq(assinaturas.id, assinatura.id));
    expect(atualizada.status).toBe("ativa");
    expect(atualizada.atrasadaDesde).toBeNull();
    expect(atualizada.proximaCobrancaEm).toEqual(new Date(1999999999 * 1000));
  });

  it("invoice.payment_failed marca como atrasada e registra atrasada_desde na primeira falha", async () => {
    const { empresa, unidade } = await criarEmpresaComAdmin();
    const assinatura = await criarAssinatura(empresa.id, unidade.id, { status: "ativa", subscriptionIdGateway: "sub_xyz" });

    await processarEventoStripe(db, eventoFalso("evt_2", "invoice.payment_failed", invoiceFalsa("sub_xyz")));

    const [atualizada] = await db.select().from(assinaturas).where(eq(assinaturas.id, assinatura.id));
    expect(atualizada.status).toBe("atrasada");
    expect(atualizada.atrasadaDesde).not.toBeNull();
  });

  it("invoice.payment_failed NAO reseta atrasada_desde numa segunda falha (nao reinicia a graca)", async () => {
    const { empresa, unidade } = await criarEmpresaComAdmin();
    const dataOriginal = new Date("2026-01-01T00:00:00Z");
    const assinatura = await criarAssinatura(empresa.id, unidade.id, {
      status: "atrasada",
      atrasadaDesde: dataOriginal,
      subscriptionIdGateway: "sub_repeticao",
    });

    await processarEventoStripe(db, eventoFalso("evt_3", "invoice.payment_failed", invoiceFalsa("sub_repeticao")));

    const [atualizada] = await db.select().from(assinaturas).where(eq(assinaturas.id, assinatura.id));
    expect(atualizada.atrasadaDesde).toEqual(dataOriginal);
  });

  it("customer.subscription.deleted marca como cancelada", async () => {
    const { empresa, unidade } = await criarEmpresaComAdmin();
    const assinatura = await criarAssinatura(empresa.id, unidade.id, { status: "ativa", subscriptionIdGateway: "sub_cancelar" });

    await processarEventoStripe(
      db,
      eventoFalso("evt_4", "customer.subscription.deleted", { id: "sub_cancelar", status: "canceled" }),
    );

    const [atualizada] = await db.select().from(assinaturas).where(eq(assinaturas.id, assinatura.id));
    expect(atualizada.status).toBe("cancelada");
  });

  it("customer.subscription.updated mapeia past_due para atrasada", async () => {
    const { empresa, unidade } = await criarEmpresaComAdmin();
    const assinatura = await criarAssinatura(empresa.id, unidade.id, { status: "ativa", subscriptionIdGateway: "sub_pastdue" });

    await processarEventoStripe(
      db,
      eventoFalso("evt_5", "customer.subscription.updated", { id: "sub_pastdue", status: "past_due" }),
    );

    const [atualizada] = await db.select().from(assinaturas).where(eq(assinaturas.id, assinatura.id));
    expect(atualizada.status).toBe("atrasada");
  });

  it("ignora eventos de subscription sem assinatura local correspondente, sem lancar excecao", async () => {
    await expect(
      processarEventoStripe(db, eventoFalso("evt_6", "invoice.payment_failed", invoiceFalsa("sub_desconhecida"))),
    ).resolves.not.toThrow();
  });

  it("ignora tipos de evento que nao usamos", async () => {
    await expect(
      processarEventoStripe(db, eventoFalso("evt_7", "customer.updated", {})),
    ).resolves.not.toThrow();
  });
});

describe("processarEventoWebhookStripe - dedup e processamento na mesma transacao (doc 25)", () => {
  it("processa normalmente e marca o evento como processado", async () => {
    const { empresa, unidade } = await criarEmpresaComAdmin();
    await criarAssinatura(empresa.id, unidade.id, { status: "atrasada", atrasadaDesde: new Date(), subscriptionIdGateway: "sub_ok" });

    const resultado = await processarEventoWebhookStripe(
      db,
      eventoFalso("evt_ok", "invoice.payment_succeeded", invoiceFalsa("sub_ok")),
    );
    expect(resultado.duplicado).toBe(false);
    expect(await eventoJaProcessado(db, eventoFalso("evt_ok", "invoice.payment_succeeded", {}))).toBe(true);
  });

  it("nao marca como processado quando processarEventoStripe lanca um erro - retry da Stripe consegue tentar de novo", async () => {
    // "customer.subscription.deleted" com data.object nulo faz processarEventoStripe
    // lancar (subscription.id em cima de null) - simula uma falha real (bug, erro de
    // rede etc) no meio do processamento, nao um erro de negocio esperado.
    const eventoComFalha = eventoFalso("evt_falha", "customer.subscription.deleted", null);

    await expect(processarEventoWebhookStripe(db, eventoComFalha)).rejects.toThrow();

    // O INSERT de dedup rodou na mesma transacao que falhou - precisa ter sido
    // desfeito (rollback), senao o evento fica marcado como "ja processado" pra
    // sempre e o retry automatico da Stripe nunca mais tenta reprocessar.
    const linhas = await db.select().from(stripeWebhookEventos).where(eq(stripeWebhookEventos.id, "evt_falha"));
    expect(linhas).toHaveLength(0);

    // Confirma que um novo processarEventoWebhookStripe pra este MESMO evento ainda
    // roda de verdade (nao e tratado como duplicado) - e o que garante que o retry da
    // Stripe funciona.
    const eventoValido = eventoFalso("evt_falha", "customer.subscription.updated", { id: "sub_inexistente", status: "active" });
    const resultado = await processarEventoWebhookStripe(db, eventoValido);
    expect(resultado.duplicado).toBe(false);
  });
});
