import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { cardapioCategorias, cardapioItens, conversas, excecoesHorario } from "../src/db/schema/index.js";
import { AGENT_TOOLS } from "../src/modules/agent/tools.js";
import { executarTool } from "../src/modules/agent/tool-executor.js";
import { decodificarTokenDeReserva } from "../src/lib/reservation-link.js";
import type { AgentContext } from "../src/modules/agent/context.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
import {
  criarConversa,
  criarConversaPendente,
  criarMesa,
  criarRegraHorarioTodosOsDias,
  criarReservaDireta,
  criarSalao,
} from "./helpers/fixtures.js";

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

  it("modify_my_reservation rejeita mover a reserva pra um horario fora do funcionamento (doc 25)", async () => {
    const { empresa, unidade, mesa } = await setupUnidadeCompleta();
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-a");
    const ctx: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-a", conversaId: conversa.id };
    // criarRegraHorarioTodosOsDias (fixtures) cobre 11:00-23:00 - 03:00 fica de fora.
    const criada = await criarReservaDireta(unidade.id, mesa.id, "ig-cliente-a", { data: "2026-10-13", horaInicio: "19:00" });

    const resultado = await executarTool(db, ctx, "modify_my_reservation", {
      reservation_id: criada.id,
      hora: "03:00",
    });

    expect(resultado.isError).toBe(true);
    expect((resultado.output as { erro: string }).erro).toMatch(/fora do horario/i);
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

  it("check_reservation_status usa o fuso da unidade pra definir 'hoje', nao o UTC do servidor (doc 25)", async () => {
    const { empresa, unidade, mesa } = await setupUnidadeCompleta();
    // Unidade e America/Sao_Paulo (UTC-3, default do seed) - as 01:00 UTC de dia 16
    // ja e 22:00 de dia 15 no fuso local. Uma reserva marcada pra "2026-10-15" ainda
    // deveria contar como ativa, mas o bug antigo (new Date().toISOString() = UTC)
    // calculava "hoje" = 2026-10-16 e a reserva de ontem-UTC/hoje-local sumia.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-16T01:00:00Z"));
    try {
      await criarReservaDireta(unidade.id, mesa.id, "ig-cliente-fuso", { data: "2026-10-15" });

      const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-fuso");
      const ctx: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-fuso", conversaId: conversa.id };
      const resultado = await executarTool(db, ctx, "check_reservation_status", {});
      expect((resultado.output as { tem_reserva_ativa: boolean }).tem_reserva_ativa).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Tools do agente - get_menu (doc 18)", () => {
  it("retorna cardapio_disponivel=false quando a unidade nao tem nenhuma categoria ativa", async () => {
    const { empresa, unidade } = await setupUnidadeCompleta();
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");
    const ctx: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-1", conversaId: conversa.id };

    const resultado = await executarTool(db, ctx, "get_menu", {});
    expect(resultado.isError).toBeUndefined();
    expect((resultado.output as { cardapio_disponivel: boolean }).cardapio_disponivel).toBe(false);
  });

  it("retorna so categorias/itens ativos, com preco formatado", async () => {
    const { empresa, unidade } = await setupUnidadeCompleta();
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");
    const ctx: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-1", conversaId: conversa.id };

    const [entradas] = await db.insert(cardapioCategorias).values({ unidadeId: unidade.id, nome: "Entradas" }).returning();
    const [desativada] = await db
      .insert(cardapioCategorias)
      .values({ unidadeId: unidade.id, nome: "Fora do ar", ativo: false })
      .returning();
    await db.insert(cardapioItens).values({ categoriaId: entradas.id, nome: "Bruschetta", precoCentavos: 2590, somenteMaiorIdade: false });
    await db.insert(cardapioItens).values({ categoriaId: entradas.id, nome: "Item pausado", precoCentavos: 1000, ativo: false });
    await db.insert(cardapioItens).values({ categoriaId: desativada.id, nome: "Item de categoria pausada", precoCentavos: 500 });

    const resultado = await executarTool(db, ctx, "get_menu", {});
    const output = resultado.output as { cardapio_disponivel: boolean; categorias: Array<{ categoria: string; itens: Array<{ nome: string; preco: string }> }> };

    expect(output.cardapio_disponivel).toBe(true);
    expect(output.categorias).toHaveLength(1);
    expect(output.categorias[0].categoria).toBe("Entradas");
    expect(output.categorias[0].itens).toHaveLength(1);
    expect(output.categorias[0].itens[0].nome).toBe("Bruschetta");
    expect(output.categorias[0].itens[0].preco).toBe("R$ 25,90");
  });

  it("nao funciona antes da unidade da conversa ser resolvida", async () => {
    const { empresa } = await setupUnidadeCompleta();
    const conversa = await criarConversaPendente(empresa.id, "ig-cliente-1");
    const ctx: AgentContext = { empresaId: empresa.id, unidadeId: null, igSenderId: "ig-cliente-1", conversaId: conversa.id };

    const resultado = await executarTool(db, ctx, "get_menu", {});
    expect(resultado.isError).toBe(true);
  });
});

describe("Tools do agente - check_rodizio_price (doc 26)", () => {
  async function criarCardapioDeRodizio(unidadeId: string) {
    const [categoria] = await db.insert(cardapioCategorias).values({ unidadeId, nome: "Rodizio" }).returning();
    await db.insert(cardapioItens).values([
      { categoriaId: categoria.id, nome: "Adulto seg-qui", precoCentavos: 5990, tags: ["rodizio_adulto_dia_util"] },
      { categoriaId: categoria.id, nome: "Adulto sex-dom-feriado", precoCentavos: 6990, tags: ["rodizio_adulto_fim_de_semana_feriado"] },
      { categoriaId: categoria.id, nome: "Crianca seg-qui", precoCentavos: 2990, tags: ["rodizio_crianca_dia_util"] },
      { categoriaId: categoria.id, nome: "Crianca sex-dom-feriado", precoCentavos: 3490, tags: ["rodizio_crianca_fim_de_semana_feriado"] },
    ]);
  }

  it("erro quando o cardapio nao tem nenhum item de rodizio (nem tag nem nome reconhecivel)", async () => {
    const { empresa, unidade } = await setupUnidadeCompleta();
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");
    const ctx: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-1", conversaId: conversa.id };

    const resultado = await executarTool(db, ctx, "check_rodizio_price", { data: "2026-08-10" });
    expect(resultado.isError).toBe(true);
  });

  it("sem NENHUMA tag configurada (estado real do cardapio recem-cadastrado): ainda resolve pelo nome/preco, nao escala pro humano a toa", async () => {
    const { empresa, unidade } = await setupUnidadeCompleta();
    const [categoria] = await db.insert(cardapioCategorias).values({ unidadeId: unidade.id, nome: "Rodízio" }).returning();
    await db.insert(cardapioItens).values([
      { categoriaId: categoria.id, nome: "Rodízio Adulto — Segunda a Quinta", precoCentavos: 5990, ordem: 0 },
      { categoriaId: categoria.id, nome: "Rodízio Adulto — Sexta, Sábado, Domingo e Feriados", precoCentavos: 6990, ordem: 1 },
      { categoriaId: categoria.id, nome: "Rodízio Criança (6 a 12 anos) — Segunda a Quinta", precoCentavos: 2990, ordem: 2 },
      { categoriaId: categoria.id, nome: "Rodízio Criança (6 a 12 anos) — Sexta, Sábado, Domingo e Feriados", precoCentavos: 3490, ordem: 3 },
      { categoriaId: categoria.id, nome: "Criança até 5 anos", precoCentavos: 0, ordem: 4 },
    ]);
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");
    const ctx: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-1", conversaId: conversa.id };

    const segunda = await executarTool(db, ctx, "check_rodizio_price", { data: "2026-08-10" });
    expect(segunda.isError).toBeUndefined();
    expect((segunda.output as { preco_adulto: string; preco_crianca: string }).preco_adulto).toBe("R$ 59,90");
    expect((segunda.output as { preco_adulto: string; preco_crianca: string }).preco_crianca).toBe("R$ 29,90");

    const sabado = await executarTool(db, ctx, "check_rodizio_price", { data: "2026-08-15" });
    expect(sabado.isError).toBeUndefined();
    expect((sabado.output as { preco_adulto: string; preco_crianca: string }).preco_adulto).toBe("R$ 69,90");
    expect((sabado.output as { preco_adulto: string; preco_crianca: string }).preco_crianca).toBe("R$ 34,90");
  });

  it("segunda-feira: devolve o preco de dia util", async () => {
    const { empresa, unidade } = await setupUnidadeCompleta();
    await criarCardapioDeRodizio(unidade.id);
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");
    const ctx: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-1", conversaId: conversa.id };

    const resultado = await executarTool(db, ctx, "check_rodizio_price", { data: "2026-08-10" });
    const output = resultado.output as { dia_util_ou_fim_de_semana: string; preco_adulto: string; preco_crianca: string };
    expect(output.dia_util_ou_fim_de_semana).toBe("dia_util");
    expect(output.preco_adulto).toBe("R$ 59,90");
    expect(output.preco_crianca).toBe("R$ 29,90");
  });

  it("sabado: devolve o preco de fim de semana/feriado", async () => {
    const { empresa, unidade } = await setupUnidadeCompleta();
    await criarCardapioDeRodizio(unidade.id);
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");
    const ctx: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-1", conversaId: conversa.id };

    const resultado = await executarTool(db, ctx, "check_rodizio_price", { data: "2026-08-15" });
    const output = resultado.output as { dia_util_ou_fim_de_semana: string; preco_adulto: string; preco_crianca: string };
    expect(output.dia_util_ou_fim_de_semana).toBe("fim_de_semana_feriado");
    expect(output.preco_adulto).toBe("R$ 69,90");
    expect(output.preco_crianca).toBe("R$ 34,90");
  });

  it("feriado municipal cadastrado (dia de semana) tambem usa o preco de fim de semana/feriado", async () => {
    const { empresa, unidade } = await setupUnidadeCompleta();
    await criarCardapioDeRodizio(unidade.id);
    await db.insert(excecoesHorario).values({ unidadeId: unidade.id, data: "2026-08-11", nome: "Aniversario da cidade" });
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");
    const ctx: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-1", conversaId: conversa.id };

    const resultado = await executarTool(db, ctx, "check_rodizio_price", { data: "2026-08-11" });
    const output = resultado.output as { dia_util_ou_fim_de_semana: string; motivo: string; preco_adulto: string };
    expect(output.dia_util_ou_fim_de_semana).toBe("fim_de_semana_feriado");
    expect(output.motivo).toContain("Aniversario da cidade");
    expect(output.preco_adulto).toBe("R$ 69,90");
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

describe("Tools do agente - resolver_unidade_da_conversa (doc 17, parte 4)", () => {
  it("grava a unidade escolhida na conversa quando o id pertence a mesma empresa", async () => {
    const { empresa, unidade } = await setupUnidadeCompleta();
    const conversa = await criarConversaPendente(empresa.id, "ig-cliente-1");
    const ctx: AgentContext = { empresaId: empresa.id, unidadeId: null, igSenderId: "ig-cliente-1", conversaId: conversa.id };

    const resultado = await executarTool(db, ctx, "resolver_unidade_da_conversa", { unidade_id: unidade.id });
    expect(resultado.isError).toBeUndefined();

    const [atualizada] = await db.select().from(conversas).where(eq(conversas.id, conversa.id));
    expect(atualizada.unidadeId).toBe(unidade.id);
  });

  it("rejeita um unidade_id de outra empresa, sem gravar nada", async () => {
    const { empresa } = await setupUnidadeCompleta({ nomeEmpresa: "Empresa A", emailAdmin: "admin@a.com" });
    const { unidade: unidadeDeOutraEmpresa } = await setupUnidadeCompleta({ nomeEmpresa: "Empresa B", emailAdmin: "admin@b.com" });
    const conversa = await criarConversaPendente(empresa.id, "ig-cliente-1");
    const ctx: AgentContext = { empresaId: empresa.id, unidadeId: null, igSenderId: "ig-cliente-1", conversaId: conversa.id };

    const resultado = await executarTool(db, ctx, "resolver_unidade_da_conversa", { unidade_id: unidadeDeOutraEmpresa.id });
    expect(resultado.isError).toBe(true);

    const [aindaPendente] = await db.select().from(conversas).where(eq(conversas.id, conversa.id));
    expect(aindaPendente.unidadeId).toBeNull();
  });

  it("tools de reserva/disponibilidade recusam rodar com a unidade ainda nao resolvida (rede de seguranca)", async () => {
    const { empresa } = await setupUnidadeCompleta();
    const conversa = await criarConversaPendente(empresa.id, "ig-cliente-1");
    const ctx: AgentContext = { empresaId: empresa.id, unidadeId: null, igSenderId: "ig-cliente-1", conversaId: conversa.id };

    const resultado = await executarTool(db, ctx, "check_availability", { data: "2026-10-10", hora: "19:00", num_pessoas: 2 });
    expect(resultado.isError).toBe(true);
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
