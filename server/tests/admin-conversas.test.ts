import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
import { criarConversa } from "./helpers/fixtures.js";
import { login } from "./helpers/auth.js";

const app = createApp();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

describe("Admin - conversas (reativacao manual do agente)", () => {
  it("lista conversas da unidade e reativa uma conversa pausada", async () => {
    const { empresa, unidade, usuario, senhaAdmin } = await criarEmpresaComAdmin();
    const token = await login(app, usuario.email, senhaAdmin);
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");

    const pausar = await request(app)
      .patch(`/admin/unidades/${unidade.id}/conversas/${conversa.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ agentPaused: true });
    expect(pausar.status).toBe(200);
    expect(pausar.body.agentPaused).toBe(true);

    const lista = await request(app)
      .get(`/admin/unidades/${unidade.id}/conversas`)
      .set("Authorization", `Bearer ${token}`);
    expect(lista.body).toHaveLength(1);
    expect(lista.body[0].agentPaused).toBe(true);

    const reativar = await request(app)
      .patch(`/admin/unidades/${unidade.id}/conversas/${conversa.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ agentPaused: false });
    expect(reativar.status).toBe(200);
    expect(reativar.body.agentPaused).toBe(false);
  });

  it("nao permite reativar/ver conversa de outra empresa", async () => {
    const empresaA = await criarEmpresaComAdmin({ nomeEmpresa: "A", emailAdmin: "a@a.com", senhaAdmin: "senha-a-123" });
    const empresaB = await criarEmpresaComAdmin({ nomeEmpresa: "B", emailAdmin: "b@b.com", senhaAdmin: "senha-b-123" });
    const conversaDeA = await criarConversa(empresaA.empresa.id, empresaA.unidade.id, "ig-cliente-1");
    const tokenB = await login(app, empresaB.usuario.email, empresaB.senhaAdmin);

    const tentativa = await request(app)
      .patch(`/admin/unidades/${empresaB.unidade.id}/conversas/${conversaDeA.id}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ agentPaused: false });
    expect(tentativa.status).toBe(404);

    const listaB = await request(app)
      .get(`/admin/unidades/${empresaB.unidade.id}/conversas`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(listaB.body).toHaveLength(0);
  });
});
