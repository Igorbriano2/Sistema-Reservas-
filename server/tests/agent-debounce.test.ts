import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type Anthropic from "@anthropic-ai/sdk";
import { db } from "../src/db/client.js";
import { conversas } from "../src/db/schema/index.js";
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
const { env } = await import("../src/config/env.js");

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

let criarMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  await truncateAll();
  let contador = 0;
  vi.mocked(enviarMensagemInstagram)
    .mockReset()
    .mockImplementation(async () => `mid-resposta-${++contador}`);
  criarMock = vi.fn().mockResolvedValue(respostaDeTexto("Resposta unica pra rajada inteira"));
  vi.mocked(getAnthropicClient)
    .mockReset()
    .mockReturnValue({ messages: { create: criarMock } } as unknown as ReturnType<typeof getAnthropicClient>);
});

afterEach(() => {
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
  await criarConexaoInstagram(empresa.id, unidade.id, "ig-conta-restaurante");
  return { empresa, unidade, salao, mesa };
}

function evento(mid: string, text: string) {
  return {
    sender: { id: "ig-cliente-1" },
    recipient: { id: "ig-conta-restaurante" },
    message: { mid, text },
  };
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// AGENT_DEBOUNCE_MS nos testes e pequeno (ver tests/setup-env.ts) - da pra usar
// esperas reais curtas em vez de precisar de fake timers (que nao combinam bem com
// os varios awaits de I/O real do Postgres dentro do callback agendado).
const ANTES_DO_DEBOUNCE = Math.max(10, Math.floor(env.AGENT_DEBOUNCE_MS * 0.6));
const DEPOIS_DO_DEBOUNCE = env.AGENT_DEBOUNCE_MS + 200;

describe("Agrupamento (debounce) de mensagens em rajada", () => {
  it("varias mensagens seguidas do mesmo cliente geram UMA unica resposta, com o texto agrupado", async () => {
    await setupCompleto();

    await processarEventoDoInstagram(db, evento("m1", "oi"));
    await processarEventoDoInstagram(db, evento("m2", "queria saber"));
    await processarEventoDoInstagram(db, evento("m3", "se tem mesa hoje"));

    await esperar(DEPOIS_DO_DEBOUNCE);

    expect(criarMock).toHaveBeenCalledTimes(1);
    expect(enviarMensagemInstagram).toHaveBeenCalledTimes(1);

    const ultimaMensagem = criarMock.mock.calls[0][0].messages.at(-1);
    expect(ultimaMensagem.role).toBe("user");
    expect(ultimaMensagem.content).toContain("oi");
    expect(ultimaMensagem.content).toContain("queria saber");
    expect(ultimaMensagem.content).toContain("se tem mesa hoje");
  });

  it("uma nova mensagem durante a espera reinicia o debounce, sem responder ate a rajada realmente parar", async () => {
    await setupCompleto();

    await processarEventoDoInstagram(db, evento("m1", "primeira mensagem"));

    // ainda dentro da janela de espera - nao deveria ter respondido
    await esperar(ANTES_DO_DEBOUNCE);
    expect(criarMock).not.toHaveBeenCalled();

    // chega mais uma mensagem: reinicia a contagem a partir dela
    await processarEventoDoInstagram(db, evento("m2", "segunda mensagem"));

    // se o debounce NAO tivesse reiniciado, essa marca (contada da 1a mensagem) ja
    // teria passado do limite e disparado - aqui ainda nao deve ter disparado.
    await esperar(ANTES_DO_DEBOUNCE);
    expect(criarMock).not.toHaveBeenCalled();

    // agora sim passou do tempo de espera contado a partir da SEGUNDA mensagem
    await esperar(DEPOIS_DO_DEBOUNCE);
    expect(criarMock).toHaveBeenCalledTimes(1);

    const ultimaMensagem = criarMock.mock.calls[0][0].messages.at(-1);
    expect(ultimaMensagem.content).toContain("primeira mensagem");
    expect(ultimaMensagem.content).toContain("segunda mensagem");
  });

  it("uma rajada ja respondida nao se mistura com uma mensagem nova que chega depois (turnos separados)", async () => {
    await setupCompleto();

    await processarEventoDoInstagram(db, evento("m1", "primeira rajada"));
    await esperar(DEPOIS_DO_DEBOUNCE);
    expect(criarMock).toHaveBeenCalledTimes(1);

    await processarEventoDoInstagram(db, evento("m2", "mensagem separada depois"));
    await esperar(DEPOIS_DO_DEBOUNCE);
    expect(criarMock).toHaveBeenCalledTimes(2);

    const segundoTurno = criarMock.mock.calls[1][0].messages.at(-1);
    expect(segundoTurno.content).toBe("mensagem separada depois");
    expect(segundoTurno.content).not.toContain("primeira rajada");
  });

  it("se um humano assume a conversa durante a espera, o turno agendado e pulado", async () => {
    const { unidade } = await setupCompleto();

    await processarEventoDoInstagram(db, evento("m1", "oi, quero uma mesa"));

    const [conversa] = await db.select().from(conversas).where(eq(conversas.unidadeId, unidade.id));
    await db.update(conversas).set({ agentPaused: true }).where(eq(conversas.id, conversa.id));

    await esperar(DEPOIS_DO_DEBOUNCE);

    expect(criarMock).not.toHaveBeenCalled();
    expect(enviarMensagemInstagram).not.toHaveBeenCalled();
  });
});
