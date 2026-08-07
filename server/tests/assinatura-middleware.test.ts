import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { db } from "../src/db/client.js";
import { empresas } from "../src/db/schema/index.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
import { criarAssinatura } from "./helpers/fixtures.js";
import { login } from "./helpers/auth.js";

const app = createApp();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

async function setup() {
  const empresa = await criarEmpresaComAdmin();
  const token = await login(app, empresa.usuario.email, empresa.senhaAdmin);
  return { ...empresa, token };
}

describe("Middleware de bloqueio por assinatura", () => {
  it("empresa sem nenhuma linha de assinatura (seed/modo teste) acessa normalmente", async () => {
    const { unidade, token } = await setup();
    const resposta = await request(app).get(`/admin/unidades/${unidade.id}/saloes`).set("Authorization", `Bearer ${token}`);
    expect(resposta.status).toBe(200);
  });

  it("empresa com assinatura trialing/ativa acessa normalmente", async () => {
    const { empresa, unidade, token } = await setup();
    await criarAssinatura(empresa.id, unidade.id, { status: "trialing" });
    const resposta = await request(app).get(`/admin/unidades/${unidade.id}/saloes`).set("Authorization", `Bearer ${token}`);
    expect(resposta.status).toBe(200);
  });

  it("assinatura cancelada bloqueia com 402", async () => {
    const { empresa, unidade, token } = await setup();
    await criarAssinatura(empresa.id, unidade.id, { status: "cancelada" });
    const resposta = await request(app).get(`/admin/unidades/${unidade.id}/saloes`).set("Authorization", `Bearer ${token}`);
    expect(resposta.status).toBe(402);
  });

  it("assinatura atrasada DENTRO do periodo de graca libera com aviso no header", async () => {
    const { empresa, unidade, token } = await setup();
    const ontem = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    await criarAssinatura(empresa.id, unidade.id, { status: "atrasada", atrasadaDesde: ontem });

    const resposta = await request(app).get(`/admin/unidades/${unidade.id}/saloes`).set("Authorization", `Bearer ${token}`);
    expect(resposta.status).toBe(200);
    expect(resposta.headers["x-assinatura-aviso"]).toBe("atrasada");
  });

  it("assinatura atrasada ALEM do periodo de graca bloqueia com 402", async () => {
    const { empresa, unidade, token } = await setup();
    const dezDiasAtras = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await criarAssinatura(empresa.id, unidade.id, { status: "atrasada", atrasadaDesde: dezDiasAtras });

    const resposta = await request(app).get(`/admin/unidades/${unidade.id}/saloes`).set("Authorization", `Bearer ${token}`);
    expect(resposta.status).toBe(402);
  });

  it("status manual 'suspenso' bloqueia MESMO com assinatura ativa na Stripe (override sempre vence)", async () => {
    const { empresa, unidade, token } = await setup();
    await criarAssinatura(empresa.id, unidade.id, { status: "ativa" });
    await db.update(empresas).set({ assinaturaStatus: "suspenso" }).where(eq(empresas.id, empresa.id));

    const resposta = await request(app).get(`/admin/unidades/${unidade.id}/saloes`).set("Authorization", `Bearer ${token}`);
    expect(resposta.status).toBe(402);
    expect(resposta.body.motivo).toBe("manual");
  });

  it("status manual 'cancelado' bloqueia mesmo sem nenhuma linha de assinatura ainda", async () => {
    const { empresa, unidade, token } = await setup();
    await db.update(empresas).set({ assinaturaStatus: "cancelado" }).where(eq(empresas.id, empresa.id));

    const resposta = await request(app).get(`/admin/unidades/${unidade.id}/saloes`).set("Authorization", `Bearer ${token}`);
    expect(resposta.status).toBe(402);
  });

  it("mesmo bloqueada, a rota /admin/assinatura continua acessivel (dono ve status e pode cancelar)", async () => {
    const { empresa, unidade, token } = await setup();
    await criarAssinatura(empresa.id, unidade.id, { status: "cancelada" });

    const resposta = await request(app).get("/admin/assinatura").set("Authorization", `Bearer ${token}`);
    expect(resposta.status).toBe(200);
    expect(resposta.body.status).toBe("cancelada");
  });
});

describe("POST /admin/assinatura/cancelar", () => {
  it("rejeita cancelar quando a assinatura ja nao esta mais em trial", async () => {
    const { empresa, unidade, token } = await setup();
    await criarAssinatura(empresa.id, unidade.id, { status: "ativa" });

    const resposta = await request(app).post("/admin/assinatura/cancelar").set("Authorization", `Bearer ${token}`);
    expect(resposta.status).toBe(400);
  });

  it("rejeita cancelar quando a empresa nao tem nenhuma assinatura", async () => {
    const { token } = await setup();
    const resposta = await request(app).post("/admin/assinatura/cancelar").set("Authorization", `Bearer ${token}`);
    expect(resposta.status).toBe(404);
  });

  it("funcionario nao acessa as rotas de assinatura (owner only)", async () => {
    const { empresa, unidade, token } = await setup();
    await criarAssinatura(empresa.id, unidade.id, { status: "trialing" });

    const funcionario = await request(app)
      .post("/admin/usuarios")
      .set("Authorization", `Bearer ${token}`)
      .send({ nome: "Func", email: "func-assinatura@teste.com", senha: "senha12345", papel: "funcionario" });
    expect(funcionario.status).toBe(201);
    const tokenFunc = await login(app, "func-assinatura@teste.com", "senha12345");

    const resposta = await request(app).get("/admin/assinatura").set("Authorization", `Bearer ${tokenFunc}`);
    expect(resposta.status).toBe(403);
  });
});
