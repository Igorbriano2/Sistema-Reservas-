import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/db/client.js";
import { criarReserva } from "../src/lib/reservations.js";
import { ConflitoDeHorarioError } from "../src/lib/errors.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
import { criarMesa, criarSalao } from "./helpers/fixtures.js";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

describe("Concorrencia na criacao de reservas", () => {
  it("sob duas requisicoes simultaneas para a MESMA mesa/horario, so uma e criada", async () => {
    const { unidade } = await criarEmpresaComAdmin();
    const salao = await criarSalao(unidade.id);
    const mesa = await criarMesa(salao.id, { capacidadeMin: 1, capacidadeMax: 4 });

    const parametrosBase = {
      unidadeId: unidade.id,
      mesaId: mesa.id,
      data: "2026-09-10",
      horaInicio: "20:00",
      horaFim: "21:30",
      numPessoas: 2,
      canalOrigem: "manual" as const,
    };

    const resultados = await Promise.allSettled([
      criarReserva(db, { ...parametrosBase, clienteNome: "Cliente 1" }),
      criarReserva(db, { ...parametrosBase, clienteNome: "Cliente 2" }),
      criarReserva(db, { ...parametrosBase, clienteNome: "Cliente 3" }),
      criarReserva(db, { ...parametrosBase, clienteNome: "Cliente 4" }),
      criarReserva(db, { ...parametrosBase, clienteNome: "Cliente 5" }),
    ]);

    const sucesso = resultados.filter((r) => r.status === "fulfilled");
    const falhas = resultados.filter((r) => r.status === "rejected");

    expect(sucesso).toHaveLength(1);
    expect(falhas).toHaveLength(4);
    for (const falha of falhas) {
      if (falha.status === "rejected") {
        expect(falha.reason).toBeInstanceOf(ConflitoDeHorarioError);
      }
    }
  });

  it("permite reservas na mesma mesa em horarios que nao se sobrepoem", async () => {
    const { unidade } = await criarEmpresaComAdmin();
    const salao = await criarSalao(unidade.id);
    const mesa = await criarMesa(salao.id, { capacidadeMin: 1, capacidadeMax: 4 });

    const primeira = await criarReserva(db, {
      unidadeId: unidade.id,
      mesaId: mesa.id,
      data: "2026-09-10",
      horaInicio: "19:00",
      horaFim: "20:00",
      numPessoas: 2,
      clienteNome: "Cliente 1",
      canalOrigem: "manual",
    });
    const segunda = await criarReserva(db, {
      unidadeId: unidade.id,
      mesaId: mesa.id,
      data: "2026-09-10",
      horaInicio: "20:00",
      horaFim: "21:00",
      numPessoas: 2,
      clienteNome: "Cliente 2",
      canalOrigem: "manual",
    });

    expect(primeira.id).not.toBe(segunda.id);
  });

  it("rejeita reserva fora da capacidade da mesa", async () => {
    const { unidade } = await criarEmpresaComAdmin();
    const salao = await criarSalao(unidade.id);
    const mesa = await criarMesa(salao.id, { capacidadeMin: 2, capacidadeMax: 4 });

    await expect(
      criarReserva(db, {
        unidadeId: unidade.id,
        mesaId: mesa.id,
        data: "2026-09-10",
        horaInicio: "19:00",
        horaFim: "20:00",
        numPessoas: 8,
        clienteNome: "Grupo grande",
        canalOrigem: "manual",
      }),
    ).rejects.toThrow();
  });
});
