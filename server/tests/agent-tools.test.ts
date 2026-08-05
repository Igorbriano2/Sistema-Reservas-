import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { conversas } from "../src/db/schema/index.js";
import { executarTool } from "../src/modules/agent/tool-executor.js";
import type { AgentContext } from "../src/modules/agent/context.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
import { criarConversa, criarMesa, criarRegraHorarioTodosOsDias, criarSalao } from "./helpers/fixtures.js";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

async function setupUnidadeCompleta(overrides: { nomeEmpresa?: string; emailAdmin?: string } = {}) {
  const { empresa, unidade } = await criarEmpresaComAdmin(overrides);
  const salao = await criarSalao(unidade.id);
  const mesa = await criarMesa(salao.id, { capacidadeMin: 1, capacidadeMax: 4 });
  await criarRegraHorarioTodosOsDias(unidade.id);
  return { empresa, unidade, salao, mesa };
}

describe("Tools do agente - check_availability e create_reservation", () => {
  it("check_availability encontra a mesa cadastrada", async () => {
    const { empresa, unidade, mesa } = await setupUnidadeCompleta();
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");
    const ctx: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-1", conversaId: conversa.id };

    const resultado = await executarTool(db, ctx, "check_availability", {
      data: "2026-10-10",
      hora: "19:00",
      num_pessoas: 2,
    });

    expect(resultado.isError).toBeUndefined();
    const output = resultado.output as { disponivel: boolean; mesas: Array<{ mesa_id: string }> };
    expect(output.disponivel).toBe(true);
    expect(output.mesas[0].mesa_id).toBe(mesa.id);
  });

  it("create_reservation cria a reserva vinculada ao ig_sender_id do contexto, nunca de um input do modelo", async () => {
    const { empresa, unidade, mesa } = await setupUnidadeCompleta();
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");
    const ctx: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-1", conversaId: conversa.id };

    // O modelo tenta (mal-intencionadamente ou nao) informar um ig_sender_id/unidade_id
    // diferente no input da tool - isso deve ser ignorado, pois nao faz parte do schema.
    const resultado = await executarTool(db, ctx, "create_reservation", {
      data: "2026-10-10",
      hora: "19:00",
      num_pessoas: 2,
      mesa_id: mesa.id,
      nome: "Cliente Teste",
      ig_sender_id: "outro-sender-forjado",
      unidade_id: "00000000-0000-0000-0000-000000000000",
    });

    expect(resultado.isError).toBeUndefined();

    const encontradas = await executarTool(db, ctx, "find_my_reservations", {});
    const output = encontradas.output as { reservas: Array<{ reservation_id: string }> };
    expect(output.reservas).toHaveLength(1);
  });

  it("create_reservation retorna erro amigavel (isError) em conflito de horario, sem lancar excecao crua", async () => {
    const { empresa, unidade, mesa } = await setupUnidadeCompleta();
    const conversaA = await criarConversa(empresa.id, unidade.id, "ig-cliente-a");
    const conversaB = await criarConversa(empresa.id, unidade.id, "ig-cliente-b");
    const ctxA: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-a", conversaId: conversaA.id };
    const ctxB: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-b", conversaId: conversaB.id };

    const primeira = await executarTool(db, ctxA, "create_reservation", {
      data: "2026-10-11",
      hora: "20:00",
      num_pessoas: 2,
      mesa_id: mesa.id,
      nome: "Cliente A",
    });
    expect(primeira.isError).toBeUndefined();

    const segunda = await executarTool(db, ctxB, "create_reservation", {
      data: "2026-10-11",
      hora: "20:30",
      num_pessoas: 2,
      mesa_id: mesa.id,
      nome: "Cliente B",
    });
    expect(segunda.isError).toBe(true);
    expect((segunda.output as { erro: string }).erro).toBeTruthy();
  });
});

describe("Tools do agente - posse de reserva (find/modify/cancel/status)", () => {
  it("find_my_reservations so retorna reservas do proprio ig_sender_id, mesmo na mesma unidade", async () => {
    const { empresa, unidade, mesa } = await setupUnidadeCompleta();
    const conversaA = await criarConversa(empresa.id, unidade.id, "ig-cliente-a");
    const conversaB = await criarConversa(empresa.id, unidade.id, "ig-cliente-b");
    const ctxA: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-a", conversaId: conversaA.id };
    const ctxB: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-b", conversaId: conversaB.id };

    await executarTool(db, ctxA, "create_reservation", {
      data: "2026-10-12",
      hora: "19:00",
      num_pessoas: 2,
      mesa_id: mesa.id,
      nome: "Cliente A",
    });

    const deB = await executarTool(db, ctxB, "find_my_reservations", {});
    expect((deB.output as { reservas: unknown[] }).reservas).toHaveLength(0);

    const deA = await executarTool(db, ctxA, "find_my_reservations", {});
    expect((deA.output as { reservas: unknown[] }).reservas).toHaveLength(1);
  });

  it("modify_my_reservation rejeita com erro generico quando a reserva e de outro cliente (sem revelar que ela existe)", async () => {
    const { empresa, unidade, mesa } = await setupUnidadeCompleta();
    const conversaA = await criarConversa(empresa.id, unidade.id, "ig-cliente-a");
    const conversaB = await criarConversa(empresa.id, unidade.id, "ig-cliente-b");
    const ctxA: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-a", conversaId: conversaA.id };
    const ctxB: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-b", conversaId: conversaB.id };

    const criada = await executarTool(db, ctxA, "create_reservation", {
      data: "2026-10-13",
      hora: "19:00",
      num_pessoas: 2,
      mesa_id: mesa.id,
      nome: "Cliente A",
    });
    const reservationId = (criada.output as { reservation_id: string }).reservation_id;

    const tentativaDeB = await executarTool(db, ctxB, "modify_my_reservation", {
      reservation_id: reservationId,
      num_pessoas: 5,
    });
    expect(tentativaDeB.isError).toBe(true);
    expect((tentativaDeB.output as { erro: string }).erro).toMatch(/nao encontrada/i);

    const tentativaComIdInexistente = await executarTool(db, ctxB, "modify_my_reservation", {
      reservation_id: "00000000-0000-0000-0000-000000000000",
      num_pessoas: 5,
    });
    // mesma mensagem generica tanto para "nao existe" quanto para "existe mas nao e sua"
    expect(tentativaComIdInexistente.output).toEqual(tentativaDeB.output);
  });

  it("cancel_my_reservation rejeita cancelar reserva de outro cliente", async () => {
    const { empresa, unidade, mesa } = await setupUnidadeCompleta();
    const conversaA = await criarConversa(empresa.id, unidade.id, "ig-cliente-a");
    const conversaB = await criarConversa(empresa.id, unidade.id, "ig-cliente-b");
    const ctxA: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-a", conversaId: conversaA.id };
    const ctxB: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-b", conversaId: conversaB.id };

    const criada = await executarTool(db, ctxA, "create_reservation", {
      data: "2026-10-14",
      hora: "19:00",
      num_pessoas: 2,
      mesa_id: mesa.id,
      nome: "Cliente A",
    });
    const reservationId = (criada.output as { reservation_id: string }).reservation_id;

    const tentativaDeB = await executarTool(db, ctxB, "cancel_my_reservation", { reservation_id: reservationId });
    expect(tentativaDeB.isError).toBe(true);

    const cancelamentoLegitimo = await executarTool(db, ctxA, "cancel_my_reservation", { reservation_id: reservationId });
    expect(cancelamentoLegitimo.isError).toBeUndefined();
    expect((cancelamentoLegitimo.output as { status: string }).status).toBe("cancelada");
  });

  it("check_reservation_status reflete apenas reservas ativas do proprio cliente", async () => {
    const { empresa, unidade, mesa } = await setupUnidadeCompleta();
    const conversaA = await criarConversa(empresa.id, unidade.id, "ig-cliente-a");
    const ctxA: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-a", conversaId: conversaA.id };

    const semReserva = await executarTool(db, ctxA, "check_reservation_status", {});
    expect((semReserva.output as { tem_reserva_ativa: boolean }).tem_reserva_ativa).toBe(false);

    await executarTool(db, ctxA, "create_reservation", {
      data: "2026-10-15",
      hora: "19:00",
      num_pessoas: 2,
      mesa_id: mesa.id,
      nome: "Cliente A",
    });

    const comReserva = await executarTool(db, ctxA, "check_reservation_status", {});
    expect((comReserva.output as { tem_reserva_ativa: boolean }).tem_reserva_ativa).toBe(true);
  });
});

describe("Tools do agente - escalate_to_human", () => {
  it("pausa a conversa (agent_paused = true)", async () => {
    const { empresa, unidade } = await setupUnidadeCompleta();
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");
    const ctx: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-1", conversaId: conversa.id };

    expect(conversa.agentPaused).toBe(false);

    const resultado = await executarTool(db, ctx, "escalate_to_human", { motivo: "Cliente pediu para falar com humano" });
    expect(resultado.isError).toBeUndefined();

    const [atualizada] = await db.select().from(conversas).where(eq(conversas.id, conversa.id));
    expect(atualizada.agentPaused).toBe(true);
  });
});

describe("Tools do agente - isolamento entre unidades diferentes com o MESMO ig_sender_id", () => {
  it("reserva feita na unidade A nao aparece para o mesmo ig_sender_id na unidade B", async () => {
    const { empresa: empresaA, unidade: unidadeA, mesa: mesaA } = await setupUnidadeCompleta({
      nomeEmpresa: "Empresa A",
      emailAdmin: "admin@a.com",
    });
    const { empresa: empresaB, unidade: unidadeB } = await setupUnidadeCompleta({
      nomeEmpresa: "Empresa B",
      emailAdmin: "admin@b.com",
    });
    const mesmoSenderId = "ig-cliente-multicontas";

    const conversaA = await criarConversa(empresaA.id, unidadeA.id, mesmoSenderId);
    const conversaB = await criarConversa(empresaB.id, unidadeB.id, mesmoSenderId);
    const ctxA: AgentContext = { empresaId: empresaA.id, unidadeId: unidadeA.id, igSenderId: mesmoSenderId, conversaId: conversaA.id };
    const ctxB: AgentContext = { empresaId: empresaB.id, unidadeId: unidadeB.id, igSenderId: mesmoSenderId, conversaId: conversaB.id };

    await executarTool(db, ctxA, "create_reservation", {
      data: "2026-10-16",
      hora: "19:00",
      num_pessoas: 2,
      mesa_id: mesaA.id,
      nome: "Cliente Multiconta",
    });

    const deB = await executarTool(db, ctxB, "find_my_reservations", {});
    expect((deB.output as { reservas: unknown[] }).reservas).toHaveLength(0);
  });
});
