import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import request from "supertest";
import { createApp } from "../src/app.js";
import { db } from "../src/db/client.js";
import { reservas } from "../src/db/schema/index.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
import { criarMesa, criarRegraHorarioTodosOsDias, criarSalao, criarSalaoSimples } from "./helpers/fixtures.js";

const app = createApp();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

describe("GET /public/widget/:unidadeId/info", () => {
  it("retorna nome/timezone da unidade sem exigir autenticacao", async () => {
    const { unidade } = await criarEmpresaComAdmin();

    const resposta = await request(app).get(`/public/widget/${unidade.id}/info`);
    expect(resposta.status).toBe(200);
    expect(resposta.body.unidadeNome).toBe(unidade.nome);
    expect(resposta.body.timezone).toBeTruthy();
    expect(resposta.body.googleTagId).toBeNull();
  });

  it("404 para unidade inexistente", async () => {
    const idFalso = "00000000-0000-0000-0000-000000000000";
    const resposta = await request(app).get(`/public/widget/${idFalso}/info`);
    expect(resposta.status).toBe(404);
  });
});

describe("GET /public/widget/:unidadeId/mesas-disponiveis", () => {
  it("marca mesa livre e compativel como disponivel", async () => {
    const { unidade } = await criarEmpresaComAdmin();
    const salao = await criarSalao(unidade.id);
    await criarMesa(salao.id, { capacidadeMin: 1, capacidadeMax: 4 });
    await criarRegraHorarioTodosOsDias(unidade.id);

    const resposta = await request(app)
      .get(`/public/widget/${unidade.id}/mesas-disponiveis`)
      .query({ data: "2026-10-10", horaInicio: "19:00", numPessoas: 2 });

    expect(resposta.status).toBe(200);
    expect(resposta.body.saloes).toHaveLength(1);
    expect(resposta.body.saloes[0].mesas[0].disponivel).toBe(true);
  });
});

describe("POST /public/widget/:unidadeId/reservations", () => {
  it("cria a reserva com canalOrigem widget e sem igSenderId, escolhendo mesa automaticamente", async () => {
    const { unidade } = await criarEmpresaComAdmin();
    const salaoSimples = await criarSalaoSimples(unidade.id, 10);
    await criarRegraHorarioTodosOsDias(unidade.id);

    const resposta = await request(app).post(`/public/widget/${unidade.id}/reservations`).send({
      data: "2026-10-10",
      horaInicio: "19:00",
      numPessoas: 2,
      clienteNome: "Cliente do Site",
      clienteTelefone: "43988414050",
    });

    expect(resposta.status).toBe(201);
    expect(resposta.body.numPessoas).toBe(2);

    const [salva] = await db.select().from(reservas).where(eq(reservas.id, resposta.body.id));
    expect(salva.canalOrigem).toBe("widget");
    expect(salva.igSenderId).toBeNull();
    expect(salva.salaoId).toBe(salaoSimples.id);
  });

  it("cria a reserva na mesa escolhida quando mesaId e informado", async () => {
    const { unidade } = await criarEmpresaComAdmin();
    const salao = await criarSalao(unidade.id);
    const mesa = await criarMesa(salao.id, { capacidadeMin: 1, capacidadeMax: 4 });
    await criarRegraHorarioTodosOsDias(unidade.id);

    const resposta = await request(app).post(`/public/widget/${unidade.id}/reservations`).send({
      data: "2026-10-10",
      horaInicio: "19:00",
      numPessoas: 2,
      clienteNome: "Cliente do Site",
      mesaId: mesa.id,
    });

    expect(resposta.status).toBe(201);
    const [salva] = await db.select().from(reservas).where(eq(reservas.id, resposta.body.id));
    expect(salva.mesaId).toBe(mesa.id);
    expect(salva.canalOrigem).toBe("widget");
  });

  it("404 pra unidade inexistente, sem criar nenhuma reserva", async () => {
    const idFalso = "00000000-0000-0000-0000-000000000000";
    const resposta = await request(app).post(`/public/widget/${idFalso}/reservations`).send({
      data: "2026-10-10",
      horaInicio: "19:00",
      numPessoas: 2,
      clienteNome: "Cliente do Site",
    });
    expect(resposta.status).toBe(404);
  });

  it("retorna erro (nao 201) quando nao ha disponibilidade, sem criar reserva", async () => {
    const { unidade } = await criarEmpresaComAdmin();
    // Sem nenhum salao/regra de horario cadastrado - nunca ha disponibilidade.
    const resposta = await request(app).post(`/public/widget/${unidade.id}/reservations`).send({
      data: "2026-10-10",
      horaInicio: "19:00",
      numPessoas: 2,
      clienteNome: "Cliente do Site",
    });
    expect(resposta.status).not.toBe(201);
    expect(await db.select().from(reservas)).toHaveLength(0);
  });
});

describe("GET /public/widget/:unidadeId/embed.js", () => {
  it("serve o snippet como application/javascript, com o unidadeId embutido", async () => {
    const { unidade } = await criarEmpresaComAdmin();

    const resposta = await request(app).get(`/public/widget/${unidade.id}/embed.js`);
    expect(resposta.status).toBe(200);
    expect(resposta.headers["content-type"]).toMatch(/javascript/);
    expect(resposta.text).toContain(unidade.id);
  });

  it("responde com um script de erro (nao 500) para unidade inexistente", async () => {
    const idFalso = "00000000-0000-0000-0000-000000000000";
    const resposta = await request(app).get(`/public/widget/${idFalso}/embed.js`);
    expect(resposta.status).toBe(404);
    expect(resposta.headers["content-type"]).toMatch(/javascript/);
  });
});
