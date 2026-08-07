import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { db } from "../src/db/client.js";
import { unidades } from "../src/db/schema/index.js";
import { closeDb, criarEmpresaComAdmin, criarFuncionario, criarUsuarioUnidade, truncateAll } from "./helpers/db.js";
import { login } from "./helpers/auth.js";

const app = createApp();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

describe("GET /admin/unidades", () => {
  it("lista apenas as unidades da propria empresa do usuario logado", async () => {
    const empresaA = await criarEmpresaComAdmin({ nomeEmpresa: "A", emailAdmin: "a@a.com", senhaAdmin: "senha-a-123" });
    const empresaB = await criarEmpresaComAdmin({ nomeEmpresa: "B", emailAdmin: "b@b.com", senhaAdmin: "senha-b-123" });
    const tokenA = await login(app, empresaA.usuario.email, empresaA.senhaAdmin);

    const res = await request(app).get("/admin/unidades").set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(empresaA.unidade.id);
    expect(res.body.some((u: { id: string }) => u.id === empresaB.unidade.id)).toBe(false);
  });

  it("exige autenticacao", async () => {
    const res = await request(app).get("/admin/unidades");
    expect(res.status).toBe(401);
  });

  it("gerente/funcionario so ve as unidades as quais o dono deu acesso (doc 17)", async () => {
    const { empresa, unidade } = await criarEmpresaComAdmin();
    const [segundaUnidade] = await db.insert(unidades).values({ empresaId: empresa.id, nome: "Segunda Unidade" }).returning();

    const { usuario: funcionario, senha } = await criarFuncionario(empresa.id);
    await criarUsuarioUnidade(funcionario.id, unidade.id);
    // Sem acesso a segundaUnidade de proposito.

    const token = await login(app, funcionario.username, senha);
    const res = await request(app).get("/admin/unidades").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(unidade.id);
    expect(res.body.some((u: { id: string }) => u.id === segundaUnidade.id)).toBe(false);
  });
});

describe("POST /admin/unidades (doc 17, parte 3 - adicionar unidade)", () => {
  it("gerente/funcionario nao pode adicionar unidade, mesmo com criar_usuarios (owner only)", async () => {
    const { empresa, unidade } = await criarEmpresaComAdmin();
    const { usuario: funcionario, senha } = await criarFuncionario(empresa.id);
    await criarUsuarioUnidade(funcionario.id, unidade.id, ["criar_usuarios"]);
    const token = await login(app, funcionario.username, senha);

    const res = await request(app)
      .post("/admin/unidades")
      .set("Authorization", `Bearer ${token}`)
      .send({ nome: "Nova Loja", paymentMethodId: "pm_fake" });
    expect(res.status).toBe(403);
  });

  it("sem STRIPE_SECRET_KEY configurada (ambiente de teste), informa servico indisponivel em vez de quebrar", async () => {
    const { usuario, senhaAdmin } = await criarEmpresaComAdmin();
    const token = await login(app, usuario.email, senhaAdmin);

    const res = await request(app)
      .post("/admin/unidades")
      .set("Authorization", `Bearer ${token}`)
      .send({ nome: "Nova Loja", paymentMethodId: "pm_fake" });
    expect(res.status).toBe(503);
  });

  it("rejeita corpo sem nome ou sem paymentMethodId", async () => {
    const { usuario, senhaAdmin } = await criarEmpresaComAdmin();
    const token = await login(app, usuario.email, senhaAdmin);

    const semNome = await request(app).post("/admin/unidades").set("Authorization", `Bearer ${token}`).send({ paymentMethodId: "pm_fake" });
    expect(semNome.status).toBe(400);

    const semPaymentMethod = await request(app).post("/admin/unidades").set("Authorization", `Bearer ${token}`).send({ nome: "Nova Loja" });
    expect(semPaymentMethod.status).toBe(400);
  });
});
