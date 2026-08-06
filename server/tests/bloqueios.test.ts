import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
import { criarRegraHorarioTodosOsDias } from "./helpers/fixtures.js";
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

async function criarSalaoEMesa(app: ReturnType<typeof createApp>, unidadeId: string, token: string) {
  const salao = await request(app)
    .post(`/admin/unidades/${unidadeId}/saloes`)
    .set("Authorization", `Bearer ${token}`)
    .send({ nome: "Salao Principal", modoConfiguracao: "mapa" });
  const mesa = await request(app)
    .post(`/admin/unidades/${unidadeId}/mesas`)
    .set("Authorization", `Bearer ${token}`)
    .send({ salaoId: salao.body.id, nome: "Mesa 1", capacidadeMin: 2, capacidadeMax: 4 });
  return { salao: salao.body, mesa: mesa.body };
}

describe("Bloqueios de mesa/salao", () => {
  it("rejeita bloqueio sem mesaId nem salaoId, e com os dois ao mesmo tempo", async () => {
    const { unidade, token } = await setup();
    const { mesa, salao } = await criarSalaoEMesa(app, unidade.id, token);

    const semAlvo = await request(app)
      .post(`/admin/unidades/${unidade.id}/bloqueios`)
      .set("Authorization", `Bearer ${token}`)
      .send({ dataInicio: "2026-10-01", dataFim: "2026-10-05", motivo: "Manutencao" });
    expect(semAlvo.status).toBe(400);

    const doisAlvos = await request(app)
      .post(`/admin/unidades/${unidade.id}/bloqueios`)
      .set("Authorization", `Bearer ${token}`)
      .send({ mesaId: mesa.id, salaoId: salao.id, dataInicio: "2026-10-01", dataFim: "2026-10-05", motivo: "Manutencao" });
    expect(doisAlvos.status).toBe(400);
  });

  it("bloqueio de mesa impede reserva manual nessa mesa dentro do periodo, mas nao fora dele", async () => {
    const { unidade, token } = await setup();
    const { mesa } = await criarSalaoEMesa(app, unidade.id, token);
    await criarRegraHorarioTodosOsDias(unidade.id);

    const bloqueio = await request(app)
      .post(`/admin/unidades/${unidade.id}/bloqueios`)
      .set("Authorization", `Bearer ${token}`)
      .send({ mesaId: mesa.id, dataInicio: "2026-10-10", dataFim: "2026-10-15", motivo: "Manutencao eletrica" });
    expect(bloqueio.status).toBe(201);

    const dentroDoPeriodo = await request(app)
      .post(`/admin/unidades/${unidade.id}/reservations`)
      .set("Authorization", `Bearer ${token}`)
      .send({ mesaId: mesa.id, data: "2026-10-12", horaInicio: "19:00", numPessoas: 2, clienteNome: "Fulano" });
    expect(dentroDoPeriodo.status).toBe(409);
    expect(dentroDoPeriodo.body.error ?? dentroDoPeriodo.text).toMatch(/bloqueada/i);

    const foraDoPeriodo = await request(app)
      .post(`/admin/unidades/${unidade.id}/reservations`)
      .set("Authorization", `Bearer ${token}`)
      .send({ mesaId: mesa.id, data: "2026-10-20", horaInicio: "19:00", numPessoas: 2, clienteNome: "Fulano" });
    expect(foraDoPeriodo.status).toBe(201);
  });

  it("bloqueio de salao inteiro impede reserva em qualquer mesa daquele salao", async () => {
    const { unidade, token } = await setup();
    const { salao, mesa } = await criarSalaoEMesa(app, unidade.id, token);
    await criarRegraHorarioTodosOsDias(unidade.id);

    await request(app)
      .post(`/admin/unidades/${unidade.id}/bloqueios`)
      .set("Authorization", `Bearer ${token}`)
      .send({ salaoId: salao.id, dataInicio: "2026-11-01", dataFim: "2026-11-02", motivo: "Evento privado" });

    const reserva = await request(app)
      .post(`/admin/unidades/${unidade.id}/reservations`)
      .set("Authorization", `Bearer ${token}`)
      .send({ mesaId: mesa.id, data: "2026-11-01", horaInicio: "19:00", numPessoas: 2, clienteNome: "Fulano" });
    expect(reserva.status).toBe(409);
  });

  it("check_availability tambem reflete o bloqueio", async () => {
    const { unidade, token } = await setup();
    const { mesa } = await criarSalaoEMesa(app, unidade.id, token);
    await criarRegraHorarioTodosOsDias(unidade.id);

    await request(app)
      .post(`/admin/unidades/${unidade.id}/bloqueios`)
      .set("Authorization", `Bearer ${token}`)
      .send({ mesaId: mesa.id, dataInicio: "2026-10-10", dataFim: "2026-10-15", motivo: "Manutencao" });

    const disponibilidade = await request(app)
      .get(`/admin/unidades/${unidade.id}/availability`)
      .set("Authorization", `Bearer ${token}`)
      .query({ data: "2026-10-12", hora: "19:00", numPessoas: 2 });

    expect(disponibilidade.body.disponivel).toBe(false);
  });

  it("lista so bloqueios ativos (dataFim ainda nao passou) e remove um bloqueio", async () => {
    const { unidade, token } = await setup();
    const { mesa } = await criarSalaoEMesa(app, unidade.id, token);

    const passado = await request(app)
      .post(`/admin/unidades/${unidade.id}/bloqueios`)
      .set("Authorization", `Bearer ${token}`)
      .send({ mesaId: mesa.id, dataInicio: "2020-01-01", dataFim: "2020-01-05", motivo: "Bloqueio antigo" });
    const futuro = await request(app)
      .post(`/admin/unidades/${unidade.id}/bloqueios`)
      .set("Authorization", `Bearer ${token}`)
      .send({ mesaId: mesa.id, dataInicio: "2030-01-01", dataFim: "2030-01-05", motivo: "Bloqueio futuro" });

    const lista = await request(app)
      .get(`/admin/unidades/${unidade.id}/bloqueios`)
      .set("Authorization", `Bearer ${token}`);
    const ids = lista.body.map((b: { id: string }) => b.id);
    expect(ids).not.toContain(passado.body.id);
    expect(ids).toContain(futuro.body.id);

    const remocao = await request(app)
      .delete(`/admin/unidades/${unidade.id}/bloqueios/${futuro.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(remocao.status).toBe(204);

    const listaDepois = await request(app)
      .get(`/admin/unidades/${unidade.id}/bloqueios`)
      .set("Authorization", `Bearer ${token}`);
    expect(listaDepois.body.map((b: { id: string }) => b.id)).not.toContain(futuro.body.id);
  });

  it("funcionario nao acessa bloqueios (owner only, igual mesas/saloes)", async () => {
    const { unidade, token } = await setup();
    const funcionario = await request(app)
      .post("/admin/usuarios")
      .set("Authorization", `Bearer ${token}`)
      .send({ nome: "Func", email: "func@teste.com", senha: "senha12345", papel: "funcionario" });
    const tokenFunc = await login(app, "func@teste.com", "senha12345");

    const resposta = await request(app)
      .get(`/admin/unidades/${unidade.id}/bloqueios`)
      .set("Authorization", `Bearer ${tokenFunc}`);
    expect(resposta.status).toBe(403);
    expect(funcionario.status).toBe(201);
  });
});
