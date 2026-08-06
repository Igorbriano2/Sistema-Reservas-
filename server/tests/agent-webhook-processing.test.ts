import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import type Anthropic from "@anthropic-ai/sdk";
import { db } from "../src/db/client.js";
import { conversas, mensagens, unidades } from "../src/db/schema/index.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
import {
  criarAgenteConfig,
  criarConexaoInstagram,
  criarMesa,
  criarRegraHorarioTodosOsDias,
  criarSalao,
} from "./helpers/fixtures.js";

vi.mock("../src/lib/instagram-api.js", () => ({
  enviarMensagemInstagram: vi.fn(),
  verificarAssinaturaDoWebhook: vi.fn(() => true),
}));
vi.mock("../src/lib/anthropic-client.js", () => ({
  getAnthropicClient: vi.fn(),
}));

const { enviarMensagemInstagram } = await import("../src/lib/instagram-api.js");
const { getAnthropicClient } = await import("../src/lib/anthropic-client.js");
const { processarEventoDoInstagram } = await import("../src/modules/agent/process-event.js");
const { _cancelarTodosOsAgendamentosParaTeste } = await import("../src/modules/agent/debounce.js");

function respostaDeTexto(texto: string): Anthropic.Message {
  return {
    id: "msg_fake",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
    content: [{ type: "text", text: texto }],
    stop_reason: "end_turn",
  };
}

// O turno do agente e disparado com atraso (debounce - ver AGENT_DEBOUNCE_MS nos
// testes, configurado bem curto). Os testes que precisam que o turno ja tenha
// rodado esperam por este tempo real antes de checar o resultado.
function aguardarTurnoAgendado(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 150));
}

beforeEach(async () => {
  await truncateAll();
  vi.mocked(enviarMensagemInstagram).mockReset().mockResolvedValue("mid-resposta-agente");
  const criarMock = vi.fn().mockResolvedValue(respostaDeTexto("Resposta automatica do agente"));
  vi.mocked(getAnthropicClient)
    .mockReset()
    .mockReturnValue({ messages: { create: criarMock } } as unknown as ReturnType<typeof getAnthropicClient>);
});

afterEach(() => {
  // Evita que um turno agendado e nao esperado por um teste vaze e dispare durante o proximo.
  _cancelarTodosOsAgendamentosParaTeste();
});

afterAll(async () => {
  await closeDb();
});

async function setupCompleto() {
  const { empresa, unidade } = await criarEmpresaComAdmin();
  const salao = await criarSalao(unidade.id);
  const mesa = await criarMesa(salao.id);
  await criarRegraHorarioTodosOsDias(unidade.id);
  await criarAgenteConfig(empresa.id);
  const conexao = await criarConexaoInstagram(empresa.id, unidade.id, "ig-conta-restaurante");
  return { empresa, unidade, salao, mesa, conexao };
}

describe("processarEventoDoInstagram - mensagem real do cliente", () => {
  it("cria conversa, chama o agente e envia a resposta pelo Instagram", async () => {
    const { unidade } = await setupCompleto();

    await processarEventoDoInstagram(db, {
      sender: { id: "ig-cliente-1" },
      recipient: { id: "ig-conta-restaurante" },
      message: { mid: "mid-cliente-1", text: "Oi, quero reservar uma mesa" },
    });
    await aguardarTurnoAgendado();

    const [conversa] = await db.select().from(conversas).where(eq(conversas.unidadeId, unidade.id));
    expect(conversa).toBeDefined();
    expect(conversa.agentPaused).toBe(false);

    const lista = await db.select().from(mensagens).where(eq(mensagens.conversaId, conversa.id));
    expect(lista).toHaveLength(2);
    expect(lista.find((m) => m.papel === "user")?.conteudo).toBe("Oi, quero reservar uma mesa");
    const assistantMsg = lista.find((m) => m.papel === "assistant");
    expect(assistantMsg?.conteudo).toBe("Resposta automatica do agente");
    expect(assistantMsg?.igMessageId).toBe("mid-resposta-agente");
    expect(assistantMsg?.enviadoPorHumano).toBe(false);

    expect(enviarMensagemInstagram).toHaveBeenCalledTimes(1);
    const argsEnvio = vi.mocked(enviarMensagemInstagram).mock.calls[0];
    expect(argsEnvio[0]).toBe("token-de-teste-do-instagram"); // token decifrado corretamente
    expect(argsEnvio[1]).toBe("ig-cliente-1");
  });

  it("deduplica reentrega do mesmo evento (mesmo mid) sem chamar o agente de novo", async () => {
    await setupCompleto();
    const evento = {
      sender: { id: "ig-cliente-1" },
      recipient: { id: "ig-conta-restaurante" },
      message: { mid: "mid-duplicado", text: "Mensagem repetida pela Meta" },
    };

    await processarEventoDoInstagram(db, evento);
    await processarEventoDoInstagram(db, evento);
    await aguardarTurnoAgendado();

    const todas = await db.select().from(mensagens);
    expect(todas.filter((m) => m.papel === "user")).toHaveLength(1);
    expect(vi.mocked(getAnthropicClient)).toHaveBeenCalledTimes(1);
  });

  it("ignora conta do Instagram sem conexao cadastrada, sem lancar excecao", async () => {
    await setupCompleto();

    await expect(
      processarEventoDoInstagram(db, {
        sender: { id: "ig-cliente-1" },
        recipient: { id: "conta-desconhecida" },
        message: { mid: "mid-x", text: "oi" },
      }),
    ).resolves.toBeUndefined();

    expect(await db.select().from(conversas)).toHaveLength(0);
    expect(await db.select().from(mensagens)).toHaveLength(0);
  });

  it("nao adivinha a unidade quando a conexao nao tem unidade fixa e a empresa tem mais de uma", async () => {
    const { empresa, unidade: unidade1 } = await criarEmpresaComAdmin();
    const [unidade2] = await db.insert(unidades).values({ empresaId: empresa.id, nome: "Segunda unidade" }).returning();
    await criarAgenteConfig(empresa.id);
    await criarConexaoInstagram(empresa.id, null, "ig-conta-multiunidade");

    await processarEventoDoInstagram(db, {
      sender: { id: "ig-cliente-1" },
      recipient: { id: "ig-conta-multiunidade" },
      message: { mid: "mid-ambiguo", text: "oi" },
    });

    expect(await db.select().from(conversas).where(eq(conversas.unidadeId, unidade1.id))).toHaveLength(0);
    expect(await db.select().from(conversas).where(eq(conversas.unidadeId, unidade2.id))).toHaveLength(0);
  });
});

describe("processarEventoDoInstagram - echo (mensagens enviadas PELA conta do restaurante)", () => {
  it("ignora echo de uma mensagem que o proprio agente enviou (mesmo mid)", async () => {
    const { unidade } = await setupCompleto();

    await processarEventoDoInstagram(db, {
      sender: { id: "ig-cliente-1" },
      recipient: { id: "ig-conta-restaurante" },
      message: { mid: "mid-cliente-1", text: "quero uma mesa" },
    });
    // espera o turno agendado disparar e mandar a resposta (com mid "mid-resposta-agente")
    // ANTES do echo dela chegar - senao o echo nao acha nada pra "casar" e pausaria a toa.
    await aguardarTurnoAgendado();

    await processarEventoDoInstagram(db, {
      sender: { id: "ig-conta-restaurante" },
      recipient: { id: "ig-cliente-1" },
      message: { mid: "mid-resposta-agente", text: "Resposta automatica do agente", is_echo: true },
    });

    const [conversa] = await db.select().from(conversas).where(eq(conversas.unidadeId, unidade.id));
    expect(conversa.agentPaused).toBe(false);
    const lista = await db.select().from(mensagens).where(eq(mensagens.conversaId, conversa.id));
    expect(lista).toHaveLength(2); // nao duplicou a mensagem do agente
  });

  it("pausa o agente quando detecta um echo que NAO veio do agente (humano na Meta Business Suite)", async () => {
    const { unidade } = await setupCompleto();

    await processarEventoDoInstagram(db, {
      sender: { id: "ig-cliente-1" },
      recipient: { id: "ig-conta-restaurante" },
      message: { mid: "mid-cliente-1", text: "quero uma mesa" },
    });

    await processarEventoDoInstagram(db, {
      sender: { id: "ig-conta-restaurante" },
      recipient: { id: "ig-cliente-1" },
      message: { mid: "mid-humano-1", text: "Oi, aqui e o gerente, posso ajudar!", is_echo: true },
    });

    const [conversa] = await db.select().from(conversas).where(eq(conversas.unidadeId, unidade.id));
    expect(conversa.agentPaused).toBe(true);
    expect(conversa.ultimaAtividadeHumanaEm).not.toBeNull();

    const humano = await db
      .select()
      .from(mensagens)
      .where(and(eq(mensagens.conversaId, conversa.id), eq(mensagens.igMessageId, "mid-humano-1")));
    expect(humano[0].enviadoPorHumano).toBe(true);
    expect(humano[0].papel).toBe("assistant");
  });

  it("conversa pausada nao aciona o agente para novas mensagens do cliente", async () => {
    const { unidade } = await setupCompleto();

    await processarEventoDoInstagram(db, {
      sender: { id: "ig-conta-restaurante" },
      recipient: { id: "ig-cliente-1" },
      message: { mid: "mid-humano-1", text: "Ja te atendo!", is_echo: true },
    });

    const [conversa] = await db.select().from(conversas).where(eq(conversas.unidadeId, unidade.id));
    expect(conversa.agentPaused).toBe(true);

    vi.mocked(getAnthropicClient).mockClear();

    await processarEventoDoInstagram(db, {
      sender: { id: "ig-cliente-1" },
      recipient: { id: "ig-conta-restaurante" },
      message: { mid: "mid-cliente-2", text: "voces tem mesa pra hoje?" },
    });

    expect(getAnthropicClient).not.toHaveBeenCalled();
    const lista = await db.select().from(mensagens).where(eq(mensagens.conversaId, conversa.id));
    expect(lista.some((m) => m.igMessageId === "mid-cliente-2")).toBe(true);
  });
});
