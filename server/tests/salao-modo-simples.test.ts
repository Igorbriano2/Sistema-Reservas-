import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import request from "supertest";
import { db } from "../src/db/client.js";
import { reservas, saloes } from "../src/db/schema/index.js";
import { criarReserva } from "../src/lib/reservations.js";
import { ConflitoDeHorarioError } from "../src/lib/errors.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
import { criarRegraHorarioTodosOsDias, criarSalaoSimples } from "./helpers/fixtures.js";
import { login } from "./helpers/auth.js";

const app = (await import("../src/app.js")).createApp();

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

describe("Modo simples do salao (lib/reservations.ts direto)", () => {
  it("nunca deixa passar da capacidade total no mesmo horario, mesmo sob concorrencia", async () => {
    const { unidade } = await criarEmpresaComAdmin();
    const salao = await criarSalaoSimples(unidade.id, 10);

    const base = {
      unidadeId: unidade.id,
      salaoId: salao.id,
      data: "2026-09-10",
      horaInicio: "20:00",
      horaFim: "21:30",
      canalOrigem: "manual" as const,
    };

    // 5 requisicoes de 3 pessoas cada = 15, mas a capacidade total e 10: no maximo
    // 3 delas podem ser aceitas (9 pessoas) - a 4a estouraria pra 12.
    const resultados = await Promise.allSettled([
      criarReserva(db, { ...base, numPessoas: 3, clienteNome: "Cliente 1" }),
      criarReserva(db, { ...base, numPessoas: 3, clienteNome: "Cliente 2" }),
      criarReserva(db, { ...base, numPessoas: 3, clienteNome: "Cliente 3" }),
      criarReserva(db, { ...base, numPessoas: 3, clienteNome: "Cliente 4" }),
      criarReserva(db, { ...base, numPessoas: 3, clienteNome: "Cliente 5" }),
    ]);

    const sucesso = resultados.filter((r) => r.status === "fulfilled");
    const falhas = resultados.filter((r) => r.status === "rejected");

    expect(sucesso).toHaveLength(3);
    expect(falhas).toHaveLength(2);
    for (const falha of falhas) {
      if (falha.status === "rejected") {
        expect(falha.reason).toBeInstanceOf(ConflitoDeHorarioError);
      }
    }

    const somaAceita = sucesso.reduce((s) => s + 3, 0);
    expect(somaAceita).toBeLessThanOrEqual(10);
  });

  it("reservas criadas em modo simples nao referenciam mesa_id (so salao_id)", async () => {
    const { unidade } = await criarEmpresaComAdmin();
    const salao = await criarSalaoSimples(unidade.id, 10);

    const reserva = await criarReserva(db, {
      unidadeId: unidade.id,
      salaoId: salao.id,
      data: "2026-09-11",
      horaInicio: "20:00",
      numPessoas: 4,
      clienteNome: "Cliente Simples",
      canalOrigem: "manual",
    });

    expect(reserva.mesaId).toBeNull();
    expect(reserva.salaoId).toBe(salao.id);

    const [linha] = await db.select().from(reservas).where(eq(reservas.id, reserva.id));
    expect(linha.mesaId).toBeNull();
    expect(linha.salaoId).toBe(salao.id);
  });

  it("permite reservas no mesmo salao em horarios que nao se sobrepoem, cada uma usando a capacidade cheia", async () => {
    const { unidade } = await criarEmpresaComAdmin();
    const salao = await criarSalaoSimples(unidade.id, 10);

    const primeira = await criarReserva(db, {
      unidadeId: unidade.id,
      salaoId: salao.id,
      data: "2026-09-12",
      horaInicio: "19:00",
      horaFim: "20:00",
      numPessoas: 10,
      clienteNome: "Grupo 1",
      canalOrigem: "manual",
    });
    const segunda = await criarReserva(db, {
      unidadeId: unidade.id,
      salaoId: salao.id,
      data: "2026-09-12",
      horaInicio: "20:00",
      horaFim: "21:00",
      numPessoas: 10,
      clienteNome: "Grupo 2",
      canalOrigem: "manual",
    });

    expect(primeira.id).not.toBe(segunda.id);
  });

  it("rejeita reserva acima da capacidade total do salao mesmo sozinha", async () => {
    const { unidade } = await criarEmpresaComAdmin();
    const salao = await criarSalaoSimples(unidade.id, 6);

    await expect(
      criarReserva(db, {
        unidadeId: unidade.id,
        salaoId: salao.id,
        data: "2026-09-13",
        horaInicio: "19:00",
        numPessoas: 8,
        clienteNome: "Grupo grande",
        canalOrigem: "manual",
      }),
    ).rejects.toThrow();
  });

  it("rejeita quando o salao ainda nao tem capacidade total configurada", async () => {
    const { unidade } = await criarEmpresaComAdmin();
    // Salao "simples" recem-criado, antes do dono configurar a capacidade total.
    const [salao] = await db
      .insert(saloes)
      .values({ unidadeId: unidade.id, nome: "Salao sem capacidade", modoConfiguracao: "simples" })
      .returning();

    await expect(
      criarReserva(db, {
        unidadeId: unidade.id,
        salaoId: salao.id,
        data: "2026-09-14",
        horaInicio: "19:00",
        numPessoas: 100,
        clienteNome: "Grupo",
        canalOrigem: "manual",
      }),
    ).rejects.toThrow();
  });

  it("exige exatamente um dos dois (mesaId/salaoId)", async () => {
    const { unidade } = await criarEmpresaComAdmin();
    await expect(
      criarReserva(db, {
        unidadeId: unidade.id,
        data: "2026-09-14",
        horaInicio: "19:00",
        numPessoas: 2,
        clienteNome: "Sem alvo",
        canalOrigem: "manual",
      }),
    ).rejects.toThrow();
  });
});

describe("Modo simples do salao (rotas /admin)", () => {
  it("cria salao em modo simples via API e reflete disponibilidade agregada", async () => {
    const { unidade, token } = await setup();
    await criarRegraHorarioTodosOsDias(unidade.id);

    const salao = await request(app)
      .post(`/admin/unidades/${unidade.id}/saloes`)
      .set("Authorization", `Bearer ${token}`)
      .send({ nome: "Salao Simples", modoConfiguracao: "simples", capacidadeTotal: 8 });
    expect(salao.status).toBe(201);
    expect(salao.body.modoConfiguracao).toBe("simples");
    expect(salao.body.capacidadeTotal).toBe(8);

    const reserva = await request(app)
      .post(`/admin/unidades/${unidade.id}/reservations`)
      .set("Authorization", `Bearer ${token}`)
      .send({ salaoId: salao.body.id, data: "2026-09-15", horaInicio: "19:00", numPessoas: 5, clienteNome: "Cliente A" });
    expect(reserva.status).toBe(201);
    expect(reserva.body.mesaId).toBeNull();

    const excedente = await request(app)
      .post(`/admin/unidades/${unidade.id}/reservations`)
      .set("Authorization", `Bearer ${token}`)
      .send({ salaoId: salao.body.id, data: "2026-09-15", horaInicio: "19:00", numPessoas: 5, clienteNome: "Cliente B" });
    expect(excedente.status).toBe(409);

    const disponibilidade = await request(app)
      .get(`/admin/unidades/${unidade.id}/availability`)
      .set("Authorization", `Bearer ${token}`)
      .query({ data: "2026-09-15", hora: "19:00", numPessoas: 3 });
    expect(disponibilidade.body.disponivel).toBe(true);
    expect(disponibilidade.body.saloesSimplesDisponiveis).toHaveLength(1);
    expect(disponibilidade.body.saloesSimplesDisponiveis[0].capacidadeDisponivel).toBe(3);
  });

  it("rejeita criar reserva informando mesaId e salaoId ao mesmo tempo", async () => {
    const { unidade, token } = await setup();
    const salao = await request(app)
      .post(`/admin/unidades/${unidade.id}/saloes`)
      .set("Authorization", `Bearer ${token}`)
      .send({ nome: "Salao Simples", modoConfiguracao: "simples", capacidadeTotal: 8 });
    const salaoMapa = await request(app)
      .post(`/admin/unidades/${unidade.id}/saloes`)
      .set("Authorization", `Bearer ${token}`)
      .send({ nome: "Salao Mapa", modoConfiguracao: "mapa" });
    const mesa = await request(app)
      .post(`/admin/unidades/${unidade.id}/mesas`)
      .set("Authorization", `Bearer ${token}`)
      .send({ salaoId: salaoMapa.body.id, nome: "Mesa 1", capacidadeMin: 1, capacidadeMax: 4 });

    const resposta = await request(app)
      .post(`/admin/unidades/${unidade.id}/reservations`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        mesaId: mesa.body.id,
        salaoId: salao.body.id,
        data: "2026-09-16",
        horaInicio: "19:00",
        numPessoas: 2,
        clienteNome: "Cliente",
      });
    expect(resposta.status).toBe(400);
  });

  it("pagina publica de reserva (link) escolhe automaticamente o salao simples quando nao ha mesas", async () => {
    const { empresa, unidade } = await criarEmpresaComAdmin();
    void empresa;
    await criarSalaoSimples(unidade.id, 6);
    await criarRegraHorarioTodosOsDias(unidade.id);
    const { gerarTokenDeReserva } = await import("../src/lib/reservation-link.js");
    const token = gerarTokenDeReserva({ unidadeId: unidade.id, igSenderId: "ig-cliente-simples" });

    const res = await request(app).post(`/public/reservation-link/${token}/reservations`).send({
      data: "2026-09-17",
      horaInicio: "19:00",
      numPessoas: 4,
      clienteNome: "Cliente Publico",
    });

    expect(res.status).toBe(201);
    const [linha] = await db.select().from(reservas).where(eq(reservas.id, res.body.id));
    expect(linha.mesaId).toBeNull();
    expect(linha.salaoId).not.toBeNull();
  });
});
