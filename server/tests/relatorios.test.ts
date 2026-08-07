import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import request from "supertest";
import { createApp } from "../src/app.js";
import { db } from "../src/db/client.js";
import { reservas } from "../src/db/schema/index.js";
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

describe("Relatorios basicos", () => {
  it("calcula ocupacao, taxa de nao comparecimento e mesas mais pedidas corretamente", async () => {
    const { unidade, token } = await setup();
    // regra padrao (fixture): 11:00-23:00, duracao 90min, sem buffer => 8 slots/dia/mesa
    await criarRegraHorarioTodosOsDias(unidade.id);

    const salao = await request(app)
      .post(`/admin/unidades/${unidade.id}/saloes`)
      .set("Authorization", `Bearer ${token}`)
      .send({ nome: "Salao Principal" });
    const mesaA = await request(app)
      .post(`/admin/unidades/${unidade.id}/mesas`)
      .set("Authorization", `Bearer ${token}`)
      .send({ salaoId: salao.body.id, nome: "Mesa A", capacidadeMin: 1, capacidadeMax: 4 });
    const mesaB = await request(app)
      .post(`/admin/unidades/${unidade.id}/mesas`)
      .set("Authorization", `Bearer ${token}`)
      .send({ salaoId: salao.body.id, nome: "Mesa B", capacidadeMin: 1, capacidadeMax: 4 });

    async function nova(mesaId: string, horaInicio: string) {
      const resposta = await request(app)
        .post(`/admin/unidades/${unidade.id}/reservations`)
        .set("Authorization", `Bearer ${token}`)
        .send({ mesaId, data: "2026-09-14", horaInicio, numPessoas: 2, clienteNome: "Fulano" });
      return resposta.body.id as string;
    }

    // Mesa A: 2 confirmadas + 1 concluida + 1 no_show = 4 reservas, 3 ocupando (confirmada+concluida)
    await nova(mesaA.body.id, "11:00");
    await nova(mesaA.body.id, "13:00");
    const concluidaId = await nova(mesaA.body.id, "15:00");
    const noShowId = await nova(mesaA.body.id, "17:00");
    await request(app)
      .patch(`/admin/unidades/${unidade.id}/reservations/${concluidaId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "concluida" });
    await request(app)
      .patch(`/admin/unidades/${unidade.id}/reservations/${noShowId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "no_show" });

    // Mesa B: 1 confirmada + 1 cancelada + 1 pendente = 3 reservas, 1 ocupando (confirmada)
    await nova(mesaB.body.id, "11:00");
    const canceladaId = await nova(mesaB.body.id, "13:00");
    const pendenteId = await nova(mesaB.body.id, "15:00");
    await request(app)
      .delete(`/admin/unidades/${unidade.id}/reservations/${canceladaId}`)
      .set("Authorization", `Bearer ${token}`);
    // "pendente" nao e alcancavel por nenhum endpoint (nada no sistema cria reserva
    // pendente hoje) - ajustada direto no banco so pra exercitar esse status no calculo.
    await db.update(reservas).set({ status: "pendente" }).where(eq(reservas.id, pendenteId));

    // Total: 7 reservas (4 mesa A, 3 mesa B). Ocupando (confirmada+concluida): 3+1=4.
    // No-show: 1. Capacidade: 8 slots/dia/mesa * 2 mesas * 2 dias (14 e 15/09) = 32.
    const relatorio = await request(app)
      .get(`/admin/unidades/${unidade.id}/relatorios`)
      .set("Authorization", `Bearer ${token}`)
      .query({ dataInicio: "2026-09-14", dataFim: "2026-09-15" });

    expect(relatorio.status).toBe(200);
    expect(relatorio.body.ocupacao.capacidadeSlots).toBe(32);
    expect(relatorio.body.ocupacao.reservasOcupando).toBe(4);
    expect(relatorio.body.ocupacao.taxa).toBeCloseTo(4 / 32, 5);

    expect(relatorio.body.naoComparecimento.totalReservas).toBe(7);
    expect(relatorio.body.naoComparecimento.totalNaoCompareceu).toBe(1);
    expect(relatorio.body.naoComparecimento.taxa).toBeCloseTo(1 / 7, 5);

    expect(relatorio.body.mesasMaisPedidas[0]).toMatchObject({ mesaNome: "Mesa A", totalReservas: 4 });
    expect(relatorio.body.mesasMaisPedidas[1]).toMatchObject({ mesaNome: "Mesa B", totalReservas: 3 });
  });

  it("retorna taxas null (sem dividir por zero) quando nao ha capacidade/reservas no periodo", async () => {
    const { unidade, token } = await setup();
    // sem nenhuma regra de horario cadastrada => capacidade 0; sem reservas => total 0
    const relatorio = await request(app)
      .get(`/admin/unidades/${unidade.id}/relatorios`)
      .set("Authorization", `Bearer ${token}`)
      .query({ dataInicio: "2026-09-14", dataFim: "2026-09-15" });

    expect(relatorio.status).toBe(200);
    expect(relatorio.body.ocupacao.capacidadeSlots).toBe(0);
    expect(relatorio.body.ocupacao.taxa).toBeNull();
    expect(relatorio.body.naoComparecimento.totalReservas).toBe(0);
    expect(relatorio.body.naoComparecimento.taxa).toBeNull();
    expect(relatorio.body.mesasMaisPedidas).toEqual([]);
  });

  it("funcionario nao acessa relatorios (owner only)", async () => {
    const { unidade, token } = await setup();
    await request(app)
      .post("/admin/usuarios")
      .set("Authorization", `Bearer ${token}`)
      .send({ nome: "Func", username: "func.relatorio", senha: "senha12345", papel: "funcionario", unidadeIds: [unidade.id] });
    const tokenFunc = await login(app, "func.relatorio", "senha12345");

    const resposta = await request(app)
      .get(`/admin/unidades/${unidade.id}/relatorios`)
      .set("Authorization", `Bearer ${tokenFunc}`)
      .query({ dataInicio: "2026-09-14", dataFim: "2026-09-15" });
    expect(resposta.status).toBe(403);
  });

  it("rejeita periodo invalido (dataFim antes de dataInicio)", async () => {
    const { unidade, token } = await setup();
    const resposta = await request(app)
      .get(`/admin/unidades/${unidade.id}/relatorios`)
      .set("Authorization", `Bearer ${token}`)
      .query({ dataInicio: "2026-09-15", dataFim: "2026-09-14" });
    expect(resposta.status).toBe(400);
  });
});
