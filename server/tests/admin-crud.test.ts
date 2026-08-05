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

describe("CRUD de saloes, mesas e regras de horario", () => {
  it("cria salao, mesa e regra de horario, e lista disponibilidade", async () => {
    const { unidade, token } = await setup();

    const salao = await request(app)
      .post(`/admin/unidades/${unidade.id}/saloes`)
      .set("Authorization", `Bearer ${token}`)
      .send({ nome: "Salao Principal" });
    expect(salao.status).toBe(201);

    const mesa = await request(app)
      .post(`/admin/unidades/${unidade.id}/mesas`)
      .set("Authorization", `Bearer ${token}`)
      .send({ salaoId: salao.body.id, nome: "Mesa 1", capacidadeMin: 2, capacidadeMax: 4 });
    expect(mesa.status).toBe(201);

    await criarRegraHorarioTodosOsDias(unidade.id);

    const disponibilidade = await request(app)
      .get(`/admin/unidades/${unidade.id}/availability`)
      .set("Authorization", `Bearer ${token}`)
      .query({ data: "2026-09-15", hora: "19:00", numPessoas: 2 });

    expect(disponibilidade.status).toBe(200);
    expect(disponibilidade.body.disponivel).toBe(true);
    expect(disponibilidade.body.mesasDisponiveis).toHaveLength(1);
  });

  it("rejeita capacidadeMax menor que capacidadeMin", async () => {
    const { unidade, token } = await setup();
    const salao = await request(app)
      .post(`/admin/unidades/${unidade.id}/saloes`)
      .set("Authorization", `Bearer ${token}`)
      .send({ nome: "Salao Principal" });

    const mesa = await request(app)
      .post(`/admin/unidades/${unidade.id}/mesas`)
      .set("Authorization", `Bearer ${token}`)
      .send({ salaoId: salao.body.id, nome: "Mesa Invalida", capacidadeMin: 5, capacidadeMax: 2 });

    expect(mesa.status).toBe(400);
  });

  it("disponibilidade retorna indisponivel fora do horario de funcionamento", async () => {
    const { unidade, token } = await setup();
    const salao = await request(app)
      .post(`/admin/unidades/${unidade.id}/saloes`)
      .set("Authorization", `Bearer ${token}`)
      .send({ nome: "Salao Principal" });
    await request(app)
      .post(`/admin/unidades/${unidade.id}/mesas`)
      .set("Authorization", `Bearer ${token}`)
      .send({ salaoId: salao.body.id, nome: "Mesa 1", capacidadeMin: 2, capacidadeMax: 4 });
    await criarRegraHorarioTodosOsDias(unidade.id, { horaAbertura: "11:00", horaFechamento: "15:00" });

    const disponibilidade = await request(app)
      .get(`/admin/unidades/${unidade.id}/availability`)
      .set("Authorization", `Bearer ${token}`)
      .query({ data: "2026-09-15", hora: "20:00", numPessoas: 2 });

    expect(disponibilidade.body.disponivel).toBe(false);
  });

  it("cria e cancela reserva manual pelo admin", async () => {
    const { unidade, token } = await setup();
    const salao = await request(app)
      .post(`/admin/unidades/${unidade.id}/saloes`)
      .set("Authorization", `Bearer ${token}`)
      .send({ nome: "Salao Principal" });
    const mesa = await request(app)
      .post(`/admin/unidades/${unidade.id}/mesas`)
      .set("Authorization", `Bearer ${token}`)
      .send({ salaoId: salao.body.id, nome: "Mesa 1", capacidadeMin: 2, capacidadeMax: 4 });

    const reserva = await request(app)
      .post(`/admin/unidades/${unidade.id}/reservations`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        mesaId: mesa.body.id,
        data: "2026-09-15",
        horaInicio: "19:00",
        horaFim: "20:30",
        numPessoas: 2,
        clienteNome: "Fulano",
      });
    expect(reserva.status).toBe(201);
    expect(reserva.body.status).toBe("confirmada");

    const cancelar = await request(app)
      .delete(`/admin/unidades/${unidade.id}/reservations/${reserva.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(cancelar.status).toBe(200);
    expect(cancelar.body.status).toBe("cancelada");
  });
});
