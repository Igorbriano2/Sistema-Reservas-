import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { closeDb, criarEmpresaComAdmin, criarFuncionario, truncateAll } from "./helpers/db.js";
import { login } from "./helpers/auth.js";
import { criarConexaoInstagram } from "./helpers/fixtures.js";

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

describe("GET /admin/instagram/connection", () => {
  it("retorna conectado=false quando a empresa nunca conectou", async () => {
    const { token } = await setup();
    const res = await request(app).get("/admin/instagram/connection").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.conectado).toBe(false);
  });

  it("retorna handle/status sem expor o access_token_encrypted", async () => {
    const { empresa, token } = await setup();
    await criarConexaoInstagram(empresa.id, null, "ig-conta-teste");

    const res = await request(app).get("/admin/instagram/connection").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.conectado).toBe(true);
    expect(res.body.status).toBe("ativo");
    expect(res.body).not.toHaveProperty("accessTokenEncrypted");
  });

  it("funcionario nao pode ver a conexao (owner-only)", async () => {
    const { empresa } = await setup();
    const funcionario = await criarFuncionario(empresa.id);
    const tokenFuncionario = await login(app, funcionario.usuario.email, funcionario.senha);

    const res = await request(app).get("/admin/instagram/connection").set("Authorization", `Bearer ${tokenFuncionario}`);
    expect(res.status).toBe(403);
  });
});
