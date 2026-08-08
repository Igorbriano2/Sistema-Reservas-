import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { db } from "../src/db/client.js";
import { verificarDisponibilidade } from "../src/lib/availability.js";
import { agoraNoFuso, paraHora } from "../src/lib/time.js";
import { executarTool } from "../src/modules/agent/tool-executor.js";
import type { AgentContext } from "../src/modules/agent/context.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
import { login } from "./helpers/auth.js";
import { criarConversa, criarMesa, criarRegraHorarioTodosOsDias, criarSalao } from "./helpers/fixtures.js";

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

// Soma "delta" minutos a partir de agora (no fuso America/Sao_Paulo, o padrao dos
// testes), lidando com virada de dia - devolve data/horaInicio prontos pra
// verificarDisponibilidade, sem depender de que horas sao agora quando o teste roda.
function dataHoraDaquiA(deltaMinutos: number): { data: string; horaInicio: string } {
  const agora = agoraNoFuso("America/Sao_Paulo");
  const totalMin = agora.minutos + deltaMinutos;
  const diasAFrente = Math.floor(totalMin / 1440);
  const minutosNoDia = ((totalMin % 1440) + 1440) % 1440;
  const dataAlvo = new Date(`${agora.data}T00:00:00Z`);
  dataAlvo.setUTCDate(dataAlvo.getUTCDate() + diasAFrente);
  return { data: dataAlvo.toISOString().slice(0, 10), horaInicio: paraHora(minutosNoDia).slice(0, 5) };
}

describe("CRUD de regras de horario com turno (doc 19: nome/antecedencia/desconto)", () => {
  it("cria e atualiza uma regra com nome, antecedencia minima e desconto", async () => {
    const { unidade, token } = await setup();

    const criada = await request(app)
      .post(`/admin/unidades/${unidade.id}/regras-horario`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        diaSemana: 5,
        nome: "Happy Hour",
        horaAbertura: "17:00",
        horaFechamento: "19:00",
        antecedenciaMinMin: 30,
        descontoPercentual: 20,
      });
    expect(criada.status).toBe(201);
    expect(criada.body.nome).toBe("Happy Hour");
    expect(criada.body.antecedenciaMinMin).toBe(30);
    expect(criada.body.descontoPercentual).toBe(20);

    const atualizada = await request(app)
      .patch(`/admin/unidades/${unidade.id}/regras-horario/${criada.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ descontoPercentual: 30 });
    expect(atualizada.status).toBe(200);
    expect(atualizada.body.descontoPercentual).toBe(30);
    expect(atualizada.body.nome).toBe("Happy Hour");
  });

  it("rejeita desconto fora do intervalo 0-100", async () => {
    const { unidade, token } = await setup();

    const resposta = await request(app)
      .post(`/admin/unidades/${unidade.id}/regras-horario`)
      .set("Authorization", `Bearer ${token}`)
      .send({ diaSemana: 1, horaAbertura: "11:00", horaFechamento: "15:00", descontoPercentual: 150 });
    expect(resposta.status).toBe(400);
  });
});

describe("verificarDisponibilidade - antecedencia minima e turno (doc 19)", () => {
  it("recusa reserva que nao respeita a antecedencia minima do turno, mas aceita quando ha antecedencia suficiente", async () => {
    // Fixa o "agora" ao meio-dia (so o Date - setTimeout/etc reais, pra nao travar as
    // queries no banco) - sem isso, dataHoraDaquiA(180) roda pro dia seguinte quando o
    // teste executa perto da meia-noite e esbarra no horaFechamento "23:59" da regra
    // (a duracao de 15min nao cabe mais antes do fechamento), fazendo o teste falhar
    // de forma intermitente dependendo da hora real em que ele roda.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-15T12:00:00-03:00"));
    try {
      const { unidade } = await criarEmpresaComAdmin();
      const salao = await criarSalao(unidade.id);
      await criarMesa(salao.id, { capacidadeMin: 1, capacidadeMax: 4 });
      // Cobre o dia inteiro (independente de que horas sao agora) com antecedencia
      // minima de 60 minutos.
      await criarRegraHorarioTodosOsDias(unidade.id, {
        horaAbertura: "00:00",
        horaFechamento: "23:59",
        duracaoPadraoMin: 15,
        antecedenciaMinMin: 60,
        nome: "Turno unico",
        descontoPercentual: 10,
      });

      const cedoDemais = dataHoraDaquiA(20);
      const resultadoCedoDemais = await verificarDisponibilidade(db, {
        unidadeId: unidade.id,
        data: cedoDemais.data,
        hora: cedoDemais.horaInicio,
        numPessoas: 2,
      });
      expect(resultadoCedoDemais.disponivel).toBe(false);
      expect(resultadoCedoDemais.motivo).toMatch(/antecedencia/i);

      const comAntecedencia = dataHoraDaquiA(180);
      const resultadoComAntecedencia = await verificarDisponibilidade(db, {
        unidadeId: unidade.id,
        data: comAntecedencia.data,
        hora: comAntecedencia.horaInicio,
        numPessoas: 2,
      });
      expect(resultadoComAntecedencia.disponivel).toBe(true);
      expect(resultadoComAntecedencia.turno?.nome).toBe("Turno unico");
      expect(resultadoComAntecedencia.turno?.descontoPercentual).toBe(10);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Tool check_availability expoe turno_nome/turno_desconto_percentual (doc 19)", () => {
  it("retorna o nome do turno e o desconto configurado quando o horario cai nele", async () => {
    // Ver comentario no describe acima - fixa o "agora" longe da virada de dia pra
    // dataHoraDaquiA(180) nao esbarrar no horaFechamento "23:59" da regra.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-15T12:00:00-03:00"));
    try {
      const { empresa, unidade } = await criarEmpresaComAdmin();
      const salao = await criarSalao(unidade.id);
      await criarMesa(salao.id, { capacidadeMin: 1, capacidadeMax: 4 });
      await criarRegraHorarioTodosOsDias(unidade.id, {
        horaAbertura: "00:00",
        horaFechamento: "23:59",
        duracaoPadraoMin: 15,
        nome: "Jantar",
        descontoPercentual: 15,
      });
      const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");
      const ctx: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-1", conversaId: conversa.id };

      const alvo = dataHoraDaquiA(180);
      const resultado = await executarTool(db, ctx, "check_availability", {
        data: alvo.data,
        hora: alvo.horaInicio,
        num_pessoas: 2,
      });

      expect(resultado.isError).toBeUndefined();
      const output = resultado.output as { disponivel: boolean; turno_nome: string | null; turno_desconto_percentual: number | null };
      expect(output.disponivel).toBe(true);
      expect(output.turno_nome).toBe("Jantar");
      expect(output.turno_desconto_percentual).toBe(15);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("verificarDisponibilidade - reserva perto do fechamento (doc 25: bug corrigido)", () => {
  it("aceita reserva cujo INICIO esta dentro do horario, mesmo que inicio+duracao ultrapasse o fechamento", async () => {
    const { unidade } = await criarEmpresaComAdmin();
    const salao = await criarSalao(unidade.id);
    await criarMesa(salao.id, { capacidadeMin: 1, capacidadeMax: 4 });
    // "Aberto o dia todo": duracaoPadraoMin de 90min nao cabe inteira entre 23:00 e
    // 23:59 - antes da correcao, isso derrubava "disponivel" pra qualquer horario
    // depois das 22:29, o que nao faz sentido pra uma unidade que se considera
    // aberta ate a meia-noite.
    await criarRegraHorarioTodosOsDias(unidade.id, {
      horaAbertura: "00:00",
      horaFechamento: "23:59",
      duracaoPadraoMin: 90,
      nome: "Aberto o dia todo",
    });

    const resultado = await verificarDisponibilidade(db, {
      unidadeId: unidade.id,
      data: "2026-06-15",
      hora: "23:00",
      numPessoas: 2,
    });
    expect(resultado.disponivel).toBe(true);
  });

  it("ainda recusa reserva cujo INICIO esta fora do horario de funcionamento", async () => {
    const { unidade } = await criarEmpresaComAdmin();
    const salao = await criarSalao(unidade.id);
    await criarMesa(salao.id, { capacidadeMin: 1, capacidadeMax: 4 });
    await criarRegraHorarioTodosOsDias(unidade.id, { horaAbertura: "11:00", horaFechamento: "15:00", duracaoPadraoMin: 90 });

    const resultado = await verificarDisponibilidade(db, {
      unidadeId: unidade.id,
      data: "2026-06-15",
      hora: "20:00",
      numPessoas: 2,
    });
    expect(resultado.disponivel).toBe(false);
    expect(resultado.motivo).toMatch(/fora do horario/i);
  });
});
