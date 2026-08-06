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

  it("marca reserva confirmada como sentada (concluida) ou como nao compareceu", async () => {
    const { unidade, token } = await setup();
    const salao = await request(app)
      .post(`/admin/unidades/${unidade.id}/saloes`)
      .set("Authorization", `Bearer ${token}`)
      .send({ nome: "Salao Principal" });
    const mesa = await request(app)
      .post(`/admin/unidades/${unidade.id}/mesas`)
      .set("Authorization", `Bearer ${token}`)
      .send({ salaoId: salao.body.id, nome: "Mesa 1", capacidadeMin: 2, capacidadeMax: 4 });

    async function novaReserva(horaInicio: string) {
      return request(app)
        .post(`/admin/unidades/${unidade.id}/reservations`)
        .set("Authorization", `Bearer ${token}`)
        .send({ mesaId: mesa.body.id, data: "2026-09-15", horaInicio, numPessoas: 2, clienteNome: "Fulano" });
    }

    const reserva1 = await novaReserva("19:00");
    const sentada = await request(app)
      .patch(`/admin/unidades/${unidade.id}/reservations/${reserva1.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "concluida" });
    expect(sentada.status).toBe(200);
    expect(sentada.body.status).toBe("concluida");

    const reserva2 = await novaReserva("20:00");
    const naoCompareceu = await request(app)
      .patch(`/admin/unidades/${unidade.id}/reservations/${reserva2.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "no_show" });
    expect(naoCompareceu.status).toBe(200);
    expect(naoCompareceu.body.status).toBe("no_show");
  });

  it("rejeita marcar como sentada ou nao compareceu uma reserva que ja esta cancelada", async () => {
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
      .send({ mesaId: mesa.body.id, data: "2026-09-15", horaInicio: "19:00", numPessoas: 2, clienteNome: "Fulano" });
    await request(app)
      .delete(`/admin/unidades/${unidade.id}/reservations/${reserva.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    const tentativaSentada = await request(app)
      .patch(`/admin/unidades/${unidade.id}/reservations/${reserva.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "concluida" });
    expect(tentativaSentada.status).toBe(400);

    const tentativaNoShow = await request(app)
      .patch(`/admin/unidades/${unidade.id}/reservations/${reserva.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "no_show" });
    expect(tentativaNoShow.status).toBe(400);
  });

  it("lista reservas por periodo (dataInicio/dataFim), usado pelo dashboard gerencial", async () => {
    const { unidade, token } = await setup();
    const salao = await request(app)
      .post(`/admin/unidades/${unidade.id}/saloes`)
      .set("Authorization", `Bearer ${token}`)
      .send({ nome: "Salao Principal" });
    const mesa = await request(app)
      .post(`/admin/unidades/${unidade.id}/mesas`)
      .set("Authorization", `Bearer ${token}`)
      .send({ salaoId: salao.body.id, nome: "Mesa 1", capacidadeMin: 2, capacidadeMax: 4 });

    for (const data of ["2026-09-10", "2026-09-15", "2026-09-30"]) {
      await request(app)
        .post(`/admin/unidades/${unidade.id}/reservations`)
        .set("Authorization", `Bearer ${token}`)
        .send({ mesaId: mesa.body.id, data, horaInicio: "19:00", numPessoas: 2, clienteNome: "Fulano" });
    }

    const resposta = await request(app)
      .get(`/admin/unidades/${unidade.id}/reservations`)
      .set("Authorization", `Bearer ${token}`)
      .query({ dataInicio: "2026-09-11", dataFim: "2026-09-20" });

    expect(resposta.status).toBe(200);
    expect(resposta.body).toHaveLength(1);
    expect(resposta.body[0].data).toBe("2026-09-15");
  });
});
