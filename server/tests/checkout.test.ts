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
