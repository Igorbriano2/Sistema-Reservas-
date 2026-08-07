import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";

const app = createApp();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

describe("POST /public/checkout/validar-email (assistente de assinatura - Etapa 1)", () => {
  it("informa disponivel para um e-mail que ainda nao tem login", async () => {
    const resposta = await request(app).post("/public/checkout/validar-email").send({ email: "novo@restaurante.com" });
    expect(resposta.status).toBe(200);
    expect(resposta.body.disponivel).toBe(true);
  });

  it("informa indisponivel para um e-mail que ja e login de algum usuario", async () => {
    await criarEmpresaComAdmin({ emailAdmin: "ja-existe@teste.com" });

    const resposta = await request(app).post("/public/checkout/validar-email").send({ email: "ja-existe@teste.com" });
    expect(resposta.status).toBe(200);
    expect(resposta.body.disponivel).toBe(false);
  });

  it("a checagem nao diferencia maiusculas/minusculas (mesma normalizacao do login)", async () => {
    await criarEmpresaComAdmin({ emailAdmin: "cliente@teste.com" });

    const resposta = await request(app)
      .post("/public/checkout/validar-email")
      .send({ email: "Cliente@Teste.com" });
    expect(resposta.body.disponivel).toBe(false);
  });

  it("rejeita um e-mail com formato invalido", async () => {
    const resposta = await request(app).post("/public/checkout/validar-email").send({ email: "nao-e-email" });
    expect(resposta.status).toBe(400);
  });
});

describe("POST /public/checkout/assinar (assistente de assinatura - Etapa 2)", () => {
  const dadosValidos = {
    nome: "Maria Silva",
    telefone: "11912345678",
    email: "maria-checkout@teste.com",
    documento: "11144477735",
    nomeEmpresa: "Restaurante da Maria",
    paymentMethodId: "pm_fake_123",
  };

  it("rejeita e-mail ja em uso ANTES de tentar falar com a Stripe (nao cria nada)", async () => {
    await criarEmpresaComAdmin({ emailAdmin: "ja-existe-checkout@teste.com" });

    const resposta = await request(app)
      .post("/public/checkout/assinar")
      .send({ ...dadosValidos, email: "ja-existe-checkout@teste.com" });

    expect(resposta.status).toBe(400);
  });

  it("sem STRIPE_SECRET_KEY configurada, informa servico indisponivel em vez de quebrar", async () => {
    // Ambiente de teste nao define STRIPE_SECRET_KEY de proposito (ver setup-env.ts) -
    // confirma que o endpoint falha de forma controlada em vez de vazar um erro 500 cru.
    const resposta = await request(app).post("/public/checkout/assinar").send(dadosValidos);
    expect(resposta.status).toBe(503);
  });

  it("rejeita corpo sem paymentMethodId", async () => {
    const { paymentMethodId, ...semPaymentMethod } = dadosValidos;
    void paymentMethodId;
    const resposta = await request(app).post("/public/checkout/assinar").send(semPaymentMethod);
    expect(resposta.status).toBe(400);
  });
});

describe("POST /public/checkout/criar-conta (assistente de assinatura - Etapa 3)", () => {
  const dadosValidos = {
    nome: "Maria Silva",
    telefone: "11912345678",
    email: "maria-etapa3-rota@teste.com",
    documento: "11144477735",
    nomeEmpresa: "Restaurante da Maria",
    senha: "senhaDaMaria123",
    stripeCustomerId: "cus_valido",
    stripeSubscriptionId: "sub_valido",
  };

  it("sem STRIPE_SECRET_KEY configurada, informa servico indisponivel em vez de quebrar", async () => {
    const resposta = await request(app).post("/public/checkout/criar-conta").send(dadosValidos);
    expect(resposta.status).toBe(503);
  });

  it("rejeita corpo sem senha ou com senha curta", async () => {
    const resposta = await request(app)
      .post("/public/checkout/criar-conta")
      .send({ ...dadosValidos, senha: "curta" });
    expect(resposta.status).toBe(400);
  });

  it("rejeita corpo sem os IDs da Stripe", async () => {
    const { stripeCustomerId, stripeSubscriptionId, ...semStripeIds } = dadosValidos;
    void stripeCustomerId;
    void stripeSubscriptionId;
    const resposta = await request(app).post("/public/checkout/criar-conta").send(semStripeIds);
    expect(resposta.status).toBe(400);
  });
});

describe("POST /public/checkout/webhook", () => {
  it("rejeita sem o header stripe-signature", async () => {
    const resposta = await request(app).post("/public/checkout/webhook").send({ id: "evt_1", type: "invoice.payment_succeeded" });
    expect(resposta.status).toBe(400);
  });

  it("rejeita sem STRIPE_WEBHOOK_SECRET configurado, mesmo com um header de assinatura qualquer", async () => {
    // Ambiente de teste nao define STRIPE_WEBHOOK_SECRET de proposito - confirma que
    // o endpoint nunca tenta processar um evento sem poder validar a origem.
    const resposta = await request(app)
      .post("/public/checkout/webhook")
      .set("stripe-signature", "t=1,v1=assinatura-forjada")
      .send({ id: "evt_1", type: "invoice.payment_succeeded" });
    expect(resposta.status).toBe(400);
  });
});
