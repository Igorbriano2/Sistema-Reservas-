import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { conversas } from "../src/db/schema/index.js";
import { AGENT_TOOLS } from "../src/modules/agent/tools.js";
import { executarTool } from "../src/modules/agent/tool-executor.js";
import { decodificarTokenDeReserva } from "../src/lib/reservation-link.js";
import type { AgentContext } from "../src/modules/agent/context.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
import { criarConversa, criarMesa, criarRegraHorarioTodosOsDias, criarReservaDireta, criarSalao } from "./helpers/fixtures.js";

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

describe("O agente NUNCA cria reserva diretamente", () => {
  it("create_reservation nao existe mais no conjunto de tools oferecido a Claude", () => {
    const nomes = AGENT_TOOLS.map((t) => t.name);
    expect(nomes).not.toContain("create_reservation");
  });

  it("mesmo que algo tente chamar 'create_reservation' via executarTool, nao ha implementacao (tool desconhecida)", async () => {
    const { empresa, unidade, mesa } = await setupUnidadeCompleta();
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");
    const ctx: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-1", conversaId: conversa.id };

    const resultado = await executarTool(db, ctx, "create_reservation", {
      data: "2026-10-10",
      hora: "19:00",
      num_pessoas: 2,
      mesa_id: mesa.id,
      nome: "Cliente Teste",
    });

    expect(resultado.isError).toBe(true);
    expect((resultado.output as { erro: string }).erro).toMatch(/desconhecida/i);

    const reservas = await executarTool(db, ctx, "find_my_reservations", {});
    expect((reservas.output as { reservas: unknown[] }).reservas).toHaveLength(0);
  });
});

describe("Tools do agente - check_availability (somente informativa)", () => {
  it("encontra a mesa cadastrada e retorna resposta informativa, sem mesa_id nem nada acionavel", async () => {
    const { empresa, unidade } = await setupUnidadeCompleta();
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");
    const ctx: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-1", conversaId: conversa.id };

    const resultado = await executarTool(db, ctx, "check_availability", {
      data: "2026-10-10",
      hora: "19:00",
      num_pessoas: 2,
    });

    expect(resultado.isError).toBeUndefined();
    const output = resultado.output as Record<string, unknown>;
    expect(output.disponivel).toBe(true);
    expect(output.mesas_disponiveis).toBe(1);
    expect(output).not.toHaveProperty("mesas");

    // nao deve ter criado nenhuma reserva so por ter consultado disponibilidade
    const reservas = await executarTool(db, ctx, "find_my_reservations", {});
    expect((reservas.output as { reservas: unknown[] }).reservas).toHaveLength(0);
  });

  it("informa indisponibilidade sem lancar excecao quando nao ha mesa compativel", async () => {
    const { empresa, unidade } = await setupUnidadeCompleta();
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");
    const ctx: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-1", conversaId: conversa.id };

    const resultado = await executarTool(db, ctx, "check_availability", {
      data: "2026-10-10",
      hora: "19:00",
      num_pessoas: 20,
    });

    expect(resultado.isError).toBeUndefined();
    expect((resultado.output as { disponivel: boolean }).disponivel).toBe(false);
  });
});

describe("Tools do agente - get_reservation_link", () => {
  it("gera um link contendo um token que decodifica para a unidade e o ig_sender_id do contexto", async () => {
    const { empresa, unidade } = await setupUnidadeCompleta();
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");
    const ctx: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-1", conversaId: conversa.id };

    const resultado = await executarTool(db, ctx, "get_reservation_link", {});

    expect(resultado.isError).toBeUndefined();
    const output = resultado.output as { link: string; valido_por_minutos: number };
    expect(output.valido_por_minutos).toBe(60);
    expect(output.link).toMatch(/^https?:\/\/.+\/reservar\/.+/);

    const token = output.link.split("/reservar/")[1];
    const payload = decodificarTokenDeReserva(token);
    expect(payload.unidadeId).toBe(unidade.id);
    expect(payload.igSenderId).toBe("ig-cliente-1");
  });

  it("gera um link proprio mesmo se o modelo tentar (via texto) sugerir outro ig_sender_id - a tool nao aceita parametros", async () => {
    const { empresa, unidade } = await setupUnidadeCompleta();
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-real");
    const ctx: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-real", conversaId: conversa.id };

    // input arbitrario (a tool nao tem propriedades no schema, entao isso e ignorado)
    const resultado = await executarTool(db, ctx, "get_reservation_link", {
      ig_sender_id: "outro-sender-forjado",
      unidade_id: "00000000-0000-0000-0000-000000000000",
    });

    const output = resultado.output as { link: string };
    const token = output.link.split("/reservar/")[1];
    const payload = decodificarTokenDeReserva(token);
    expect(payload.igSenderId).toBe("ig-cliente-real");
    expect(payload.unidadeId).toBe(unidade.id);
  });
});

describe("Tools do agente - posse de reserva (find/modify/cancel/status)", () => {
  it("find_my_reservations so retorna reservas do proprio ig_sender_id, mesmo na mesma unidade", async () => {
    const { empresa, unidade, mesa } = await setupUnidadeCompleta();
    const conversaA = await criarConversa(empresa.id, unidade.id, "ig-cliente-a");
    const conversaB = await criarConversa(empresa.id, unidade.id, "ig-cliente-b");
    const ctxA: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-a", conversaId: conversaA.id };
    const ctxB: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-b", conversaId: conversaB.id };

    await criarReservaDireta(unidade.id, mesa.id, "ig-cliente-a", { data: "2026-10-12" });

    const deB = await executarTool(db, ctxB, "find_my_reservations", {});
    expect((deB.output as { reservas: unknown[] }).reservas).toHaveLength(0);

    const deA = await executarTool(db, ctxA, "find_my_reservations", {});
    expect((deA.output as { reservas: unknown[] }).reservas).toHaveLength(1);
  });

  it("modify_my_reservation rejeita com erro generico quando a reserva e de outro cliente (sem revelar que ela existe)", async () => {
    const { empresa, unidade, mesa } = await setupUnidadeCompleta();
    const conversaB = await criarConversa(empresa.id, unidade.id, "ig-cliente-b");
    const ctxB: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-b", conversaId: conversaB.id };

    const criada = await criarReservaDireta(unidade.id, mesa.id, "ig-cliente-a", { data: "2026-10-13" });

    const tentativaDeB = await executarTool(db, ctxB, "modify_my_reservation", {
      reservation_id: criada.id,
      num_pessoas: 3,
    });
    expect(tentativaDeB.isError).toBe(true);
    expect((tentativaDeB.output as { erro: string }).erro).toMatch(/nao encontrada/i);

    const tentativaComIdInexistente = await executarTool(db, ctxB, "modify_my_reservation", {
      reservation_id: "00000000-0000-0000-0000-000000000000",
      num_pessoas: 3,
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

    const criada = await criarReservaDireta(unidade.id, mesa.id, "ig-cliente-a", { data: "2026-10-14" });

    const tentativaDeB = await executarTool(db, ctxB, "cancel_my_reservation", { reservation_id: criada.id });
    expect(tentativaDeB.isError).toBe(true);

    const cancelamentoLegitimo = await executarTool(db, ctxA, "cancel_my_reservation", { reservation_id: criada.id });
    expect(cancelamentoLegitimo.isError).toBeUndefined();
    expect((cancelamentoLegitimo.output as { status: string }).status).toBe("cancelada");
  });

  it("check_reservation_status reflete apenas reservas ativas do proprio cliente", async () => {
    const { empresa, unidade, mesa } = await setupUnidadeCompleta();
    const conversaA = await criarConversa(empresa.id, unidade.id, "ig-cliente-a");
    const ctxA: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-a", conversaId: conversaA.id };

    const semReserva = await executarTool(db, ctxA, "check_reservation_status", {});
    expect((semReserva.output as { tem_reserva_ativa: boolean }).tem_reserva_ativa).toBe(false);

    await criarReservaDireta(unidade.id, mesa.id, "ig-cliente-a", { data: "2026-10-15" });

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
    const { unidade: unidadeA, mesa: mesaA } = await setupUnidadeCompleta({
      nomeEmpresa: "Empresa A",
      emailAdmin: "admin@a.com",
    });
    const { empresa: empresaB, unidade: unidadeB } = await setupUnidadeCompleta({
      nomeEmpresa: "Empresa B",
      emailAdmin: "admin@b.com",
    });
    const mesmoSenderId = "ig-cliente-multicontas";

    const conversaB = await criarConversa(empresaB.id, unidadeB.id, mesmoSenderId);
    const ctxB: AgentContext = { empresaId: empresaB.id, unidadeId: unidadeB.id, igSenderId: mesmoSenderId, conversaId: conversaB.id };

    await criarReservaDireta(unidadeA.id, mesaA.id, mesmoSenderId, { data: "2026-10-16" });

    const deB = await executarTool(db, ctxB, "find_my_reservations", {});
    expect((deB.output as { reservas: unknown[] }).reservas).toHaveLength(0);
  });
});
