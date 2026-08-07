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

async function setup() {
  const empresa = await criarEmpresaComAdmin();
  const token = await login(app, empresa.usuario.email, empresa.senhaAdmin);
  return { ...empresa, token };
}

async function criarSalaoMapa(app: ReturnType<typeof createApp>, unidadeId: string, token: string) {
  const salao = await request(app)
    .post(`/admin/unidades/${unidadeId}/saloes`)
    .set("Authorization", `Bearer ${token}`)
    .send({ nome: "Salao Principal", modoConfiguracao: "mapa" });
  return salao.body.id as string;
}

describe("CRUD de elementos do editor visual do salao (parede, porta, planta, etc.)", () => {
  it("cria um elemento e persiste posicao/tamanho/rotacao", async () => {
    const { unidade, token } = await setup();
    const salaoId = await criarSalaoMapa(app, unidade.id, token);

    const criado = await request(app)
      .post(`/admin/unidades/${unidade.id}/salao-elementos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ salaoId, tipo: "parede", nome: "Parede", posX: 10, posY: 20, largura: 160, altura: 14 });

    expect(criado.status).toBe(201);
    expect(criado.body.tipo).toBe("parede");
    expect(criado.body.posX).toBe(10);
    expect(criado.body.posY).toBe(20);
    expect(criado.body.largura).toBe(160);
    expect(criado.body.altura).toBe(14);
    expect(criado.body.rotacao).toBe(0);
    expect(criado.body.capacidade).toBeNull();

    const atualizado = await request(app)
      .patch(`/admin/unidades/${unidade.id}/salao-elementos/${criado.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ rotacao: 90, posX: 100.5, posY: 50.25, largura: 200 });

    expect(atualizado.status).toBe(200);
    expect(atualizado.body.rotacao).toBe(90);
    expect(atualizado.body.posX).toBe(100.5);
    expect(atualizado.body.posY).toBe(50.25);
    expect(atualizado.body.largura).toBe(200);

    const listado = await request(app)
      .get(`/admin/unidades/${unidade.id}/salao-elementos`)
      .set("Authorization", `Bearer ${token}`);
    expect(listado.status).toBe(200);
    const elemento = listado.body.find((e: { id: string }) => e.id === criado.body.id);
    expect(elemento.rotacao).toBe(90);
    expect(elemento.posX).toBe(100.5);
  });

  it("aceita capacidade opcional (usado pelo balcao)", async () => {
    const { unidade, token } = await setup();
    const salaoId = await criarSalaoMapa(app, unidade.id, token);

    const balcao = await request(app)
      .post(`/admin/unidades/${unidade.id}/salao-elementos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ salaoId, tipo: "balcao", nome: "Bar", posX: 0, posY: 0, largura: 220, altura: 50, capacidade: 6 });
    expect(balcao.status).toBe(201);
    expect(balcao.body.capacidade).toBe(6);

    const planta = await request(app)
      .post(`/admin/unidades/${unidade.id}/salao-elementos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ salaoId, tipo: "planta", nome: "Planta", posX: 5, posY: 5, largura: 60, altura: 60 });
    expect(planta.status).toBe(201);
    expect(planta.body.capacidade).toBeNull();
  });

  it("rejeita tipo invalido", async () => {
    const { unidade, token } = await setup();
    const salaoId = await criarSalaoMapa(app, unidade.id, token);

    const resposta = await request(app)
      .post(`/admin/unidades/${unidade.id}/salao-elementos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ salaoId, tipo: "sofa", nome: "Sofa", posX: 0, posY: 0, largura: 60, altura: 60 });
    expect(resposta.status).toBe(400);
  });

  it("rejeita salao de outra unidade", async () => {
    const { unidade, token } = await setup();
    const outraEmpresa = await criarEmpresaComAdmin({ nomeEmpresa: "Outra Empresa", emailAdmin: "outro@teste.com" });
    const outroToken = await login(app, outraEmpresa.usuario.email, outraEmpresa.senhaAdmin);
    const salaoDaOutraUnidade = await criarSalaoMapa(app, outraEmpresa.unidade.id, outroToken);

    const resposta = await request(app)
      .post(`/admin/unidades/${unidade.id}/salao-elementos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ salaoId: salaoDaOutraUnidade, tipo: "parede", nome: "Parede", posX: 0, posY: 0, largura: 160, altura: 14 });
    expect(resposta.status).toBe(400);
  });

  it("exclui um elemento", async () => {
    const { unidade, token } = await setup();
    const salaoId = await criarSalaoMapa(app, unidade.id, token);

    const criado = await request(app)
      .post(`/admin/unidades/${unidade.id}/salao-elementos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ salaoId, tipo: "planta", nome: "Planta", posX: 0, posY: 0, largura: 60, altura: 60 });

    const excluido = await request(app)
      .delete(`/admin/unidades/${unidade.id}/salao-elementos/${criado.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(excluido.status).toBe(204);

    const listado = await request(app)
      .get(`/admin/unidades/${unidade.id}/salao-elementos`)
      .set("Authorization", `Bearer ${token}`);
    expect(listado.body.find((e: { id: string }) => e.id === criado.body.id)).toBeUndefined();
  });

  it("404 ao atualizar/excluir elemento inexistente ou de outra unidade", async () => {
    const { unidade, token } = await setup();
    const idFalso = "00000000-0000-0000-0000-000000000000";

    const patch = await request(app)
      .patch(`/admin/unidades/${unidade.id}/salao-elementos/${idFalso}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ nome: "Novo nome" });
    expect(patch.status).toBe(404);

    const del = await request(app)
      .delete(`/admin/unidades/${unidade.id}/salao-elementos/${idFalso}`)
      .set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(404);
  });
});
