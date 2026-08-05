import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
import { criarMesa, criarSalao } from "./helpers/fixtures.js";
import { login } from "./helpers/auth.js";

const app = createApp();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

async function setupDuasEmpresas() {
  const empresaA = await criarEmpresaComAdmin({
    nomeEmpresa: "Empresa A",
    emailAdmin: "admin@a.com",
    senhaAdmin: "senha-a-123",
  });
  const empresaB = await criarEmpresaComAdmin({
    nomeEmpresa: "Empresa B",
    emailAdmin: "admin@b.com",
    senhaAdmin: "senha-b-123",
  });
  const tokenA = await login(app, empresaA.usuario.email, empresaA.senhaAdmin);
  const tokenB = await login(app, empresaB.usuario.email, empresaB.senhaAdmin);
  return { empresaA, empresaB, tokenA, tokenB };
}

describe("Isolamento multi-tenant nos endpoints /admin", () => {
  it("nao permite acessar a unidade de outra empresa (404 generico)", async () => {
    const { empresaA, tokenB } = await setupDuasEmpresas();

    const res = await request(app)
      .get(`/admin/unidades/${empresaA.unidade.id}/saloes`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });

  it("salao criado na unidade A nao aparece na unidade B, mesmo mesma rota relativa", async () => {
    const { empresaA, empresaB, tokenA, tokenB } = await setupDuasEmpresas();

    const criar = await request(app)
      .post(`/admin/unidades/${empresaA.unidade.id}/saloes`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ nome: "Salao da Empresa A" });
    expect(criar.status).toBe(201);

    const listaA = await request(app)
      .get(`/admin/unidades/${empresaA.unidade.id}/saloes`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(listaA.body).toHaveLength(1);

    const listaB = await request(app)
      .get(`/admin/unidades/${empresaB.unidade.id}/saloes`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(listaB.body).toHaveLength(0);
  });

  it("nao permite editar/apagar salao de outra empresa mesmo sabendo o id", async () => {
    const { empresaA, empresaB, tokenB } = await setupDuasEmpresas();
    const salaoA = await criarSalao(empresaA.unidade.id, "Salao Sigiloso A");

    // tentativa cruzada: token da empresa B, mas rota da unidade B com o ID do salao de A
    const editar = await request(app)
      .patch(`/admin/unidades/${empresaB.unidade.id}/saloes/${salaoA.id}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ nome: "Hackeado" });
    expect(editar.status).toBe(404);

    const apagar = await request(app)
      .delete(`/admin/unidades/${empresaB.unidade.id}/saloes/${salaoA.id}`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(apagar.status).toBe(404);

    // e nem mesmo tentando a rota da propria unidade A do salao com token errado
    const semAcessoAUnidade = await request(app)
      .patch(`/admin/unidades/${empresaA.unidade.id}/saloes/${salaoA.id}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ nome: "Hackeado" });
    expect(semAcessoAUnidade.status).toBe(404);
  });

  it("nao permite criar mesa vinculada a um salao de outra empresa", async () => {
    const { empresaA, empresaB, tokenB } = await setupDuasEmpresas();
    const salaoA = await criarSalao(empresaA.unidade.id);

    const res = await request(app)
      .post(`/admin/unidades/${empresaB.unidade.id}/mesas`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ salaoId: salaoA.id, nome: "Mesa Intrusa", capacidadeMin: 1, capacidadeMax: 2 });

    expect(res.status).toBe(400);
  });

  it("reservas de uma unidade nao aparecem na listagem de outra unidade", async () => {
    const { empresaA, empresaB, tokenA, tokenB } = await setupDuasEmpresas();
    const salaoA = await criarSalao(empresaA.unidade.id);
    const mesaA = await criarMesa(salaoA.id);

    const criar = await request(app)
      .post(`/admin/unidades/${empresaA.unidade.id}/reservations`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        mesaId: mesaA.id,
        data: "2026-09-01",
        horaInicio: "19:00",
        horaFim: "20:30",
        numPessoas: 2,
        clienteNome: "Cliente A",
      });
    expect(criar.status).toBe(201);

    const listaB = await request(app)
      .get(`/admin/unidades/${empresaB.unidade.id}/reservations`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(listaB.status).toBe(200);
    expect(listaB.body).toHaveLength(0);

    const listaA = await request(app)
      .get(`/admin/unidades/${empresaA.unidade.id}/reservations`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(listaA.body).toHaveLength(1);
  });
});
