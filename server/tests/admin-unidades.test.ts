import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
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
});
