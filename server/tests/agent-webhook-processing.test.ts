import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import type Anthropic from "@anthropic-ai/sdk";
import { db } from "../src/db/client.js";
import { conversas, mensagens, unidades } from "../src/db/schema/index.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
import { derivarSlugDoNome, gerarSlugDisponivel } from "../src/lib/empresas.js";
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
  obterPerfilInstagram: vi.fn(async () => ({ nome: null, fotoUrl: null })),
}));
vi.mock("../src/lib/anthropic-client.js", () => ({
  getAnthropicClient: vi.fn(),
}));

const { enviarMensagemInstagram, obterPerfilInstagram } = await import("../src/lib/instagram-api.js");
const { getAnthropicClient } = await import("../src/lib/anthropic-client.js");
const { processarEventoDoInstagram } = await import("../src/modules/agent/process-event.js");
const { marcarComoEnviadoPeloAgente } = await import("../src/lib/instagram-notify.js");
const { _cancelarTodosOsAgendamentosParaTeste } = await import("../src/modules/agent/debounce.js");

// Cast via unknown de proposito: objeto de teste minimo, so com os campos que o
// orchestrator realmente le - nao acompanha cada campo novo que a Anthropic.Message
// ganha em atualizacoes do SDK (usage detalhado, citations, etc).
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
  } as unknown as Anthropic.Message;
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
  vi.mocked(obterPerfilInstagram).mockReset().mockResolvedValue({ nome: null, fotoUrl: null });
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

  it("erro inesperado (nao um erro de negocio) durante o turno nao derruba a conversa em silencio (doc 25)", async () => {
    const { unidade } = await setupCompleto();
    // Simula uma falha real (ex: conexao com o banco caindo no meio de uma tool) - nao
    // e um AppError/ZodError, entao antes da correcao propagava sem tratamento ate o
    // .catch generico do debounce, sem avisar o cliente nem pausar a conversa.
    vi.mocked(getAnthropicClient).mockReset().mockReturnValue({
      messages: { create: vi.fn().mockRejectedValue(new Error("ECONNRESET simulado")) },
    } as unknown as ReturnType<typeof getAnthropicClient>);

    await processarEventoDoInstagram(db, {
      sender: { id: "ig-cliente-1" },
      recipient: { id: "ig-conta-restaurante" },
      message: { mid: "mid-erro-1", text: "Oi, quero reservar" },
    });
    await aguardarTurnoAgendado();

    const [conversa] = await db.select().from(conversas).where(eq(conversas.unidadeId, unidade.id));
    expect(conversa.agentPaused).toBe(true);

    expect(enviarMensagemInstagram).toHaveBeenCalledTimes(1);
    const [, , textoEnviado] = vi.mocked(enviarMensagemInstagram).mock.calls[0];
    expect(textoEnviado).toMatch(/atendente/i);
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

  it("pergunta qual unidade quando a conexao e compartilhada e a empresa tem mais de uma (doc 17, parte 4)", async () => {
    const { empresa, unidade: unidade1 } = await criarEmpresaComAdmin();
    const slugUnidade2 = await gerarSlugDisponivel(db, derivarSlugDoNome("Segunda unidade"));
    const [unidade2] = await db
      .insert(unidades)
      .values({ empresaId: empresa.id, nome: "Segunda unidade", slug: slugUnidade2 })
      .returning();
    await criarAgenteConfig(empresa.id);
    await criarConexaoInstagram(empresa.id, null, "ig-conta-multiunidade");

    await processarEventoDoInstagram(db, {
      sender: { id: "ig-cliente-1" },
      recipient: { id: "ig-conta-multiunidade" },
      message: { mid: "mid-ambiguo", text: "oi" },
    });
    await aguardarTurnoAgendado();

    // A conversa nasce, mas fica "pendente" (sem unidade) ate o agente perguntar e o
    // cliente responder - nao adivinha nem cai numa unidade ao acaso.
    const [conversa] = await db.select().from(conversas).where(eq(conversas.igSenderId, "ig-cliente-1"));
    expect(conversa).toBeDefined();
    expect(conversa.unidadeId).toBeNull();

    const argsDaChamada = vi.mocked(getAnthropicClient).mock.results[0].value.messages.create.mock.calls[0][0];
    const nomesDasTools = argsDaChamada.tools.map((t: { name: string }) => t.name);
    expect(nomesDasTools).toEqual(["resolver_unidade_da_conversa", "escalate_to_human"]);
    // Doc 35 - system agora vai em bloco (array), pro cache de prompt poder marcar
    // cache_control nele; o texto em si continua no primeiro (e unico) bloco.
    expect(argsDaChamada.system[0].text).toContain(unidade1.nome);
    expect(argsDaChamada.system[0].text).toContain(unidade2.nome);
  });

  it("resolve a unidade quando o cliente responde, e libera o toolset completo so na mensagem seguinte", async () => {
    const { empresa, unidade: unidade1 } = await criarEmpresaComAdmin();
    await criarAgenteConfig(empresa.id);
    await criarConexaoInstagram(empresa.id, null, "ig-conta-multiunidade");
    // Duas respostas do agente nesse teste (uma por mensagem do cliente) - precisam
    // de mids diferentes, senao a segunda colide com o unique index de ig_message_id.
    vi.mocked(enviarMensagemInstagram)
      .mockReset()
      .mockResolvedValueOnce("mid-resposta-1")
      .mockResolvedValueOnce("mid-resposta-2");

    const criarMock = vi
      .fn()
      .mockResolvedValueOnce({
        id: "msg_tool",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-5",
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
        content: [{ type: "tool_use", id: "tool_1", name: "resolver_unidade_da_conversa", input: { unidade_id: unidade1.id } }],
        stop_reason: "tool_use",
      })
      .mockResolvedValueOnce(respostaDeTexto("Perfeito! Em que posso ajudar?"))
      .mockResolvedValueOnce(respostaDeTexto("Resposta na unidade certa"));
    vi.mocked(getAnthropicClient)
      .mockReset()
      .mockReturnValue({ messages: { create: criarMock } } as unknown as ReturnType<typeof getAnthropicClient>);

    await processarEventoDoInstagram(db, {
      sender: { id: "ig-cliente-1" },
      recipient: { id: "ig-conta-multiunidade" },
      message: { mid: "mid-1", text: "oi, quero a primeira unidade" },
    });
    await aguardarTurnoAgendado();

    const [conversa] = await db.select().from(conversas).where(eq(conversas.igSenderId, "ig-cliente-1"));
    expect(conversa.unidadeId).toBe(unidade1.id);

    await processarEventoDoInstagram(db, {
      sender: { id: "ig-cliente-1" },
      recipient: { id: "ig-conta-multiunidade" },
      message: { mid: "mid-2", text: "quero reservar uma mesa" },
    });
    await aguardarTurnoAgendado();

    expect(criarMock).toHaveBeenCalledTimes(3);
    const nomesNaTerceiraChamada = criarMock.mock.calls[2][0].tools.map((t: { name: string }) => t.name);
    expect(nomesNaTerceiraChamada).toContain("check_availability");
    expect(nomesNaTerceiraChamada).toContain("get_reservation_link");
    expect(nomesNaTerceiraChamada).not.toContain("resolver_unidade_da_conversa");
  });
});

describe("processarEventoDoInstagram - perfil do cliente (doc 33)", () => {
  it("busca nome/foto do cliente em segundo plano ao criar uma conversa nova", async () => {
    const { unidade } = await setupCompleto();
    vi.mocked(obterPerfilInstagram).mockResolvedValueOnce({ nome: "Fulano da Silva", fotoUrl: "https://cdn.example/foto.jpg" });

    await processarEventoDoInstagram(db, {
      sender: { id: "ig-cliente-perfil" },
      recipient: { id: "ig-conta-restaurante" },
      message: { mid: "mid-perfil-1", text: "Oi" },
    });
    await aguardarTurnoAgendado();

    const [conversa] = await db.select().from(conversas).where(eq(conversas.unidadeId, unidade.id));
    expect(conversa.nomeCliente).toBe("Fulano da Silva");
    expect(conversa.fotoClienteUrl).toBe("https://cdn.example/foto.jpg");
  });

  it("falha ao buscar o perfil nao quebra o processamento da mensagem (fica sem nome/foto)", async () => {
    const { unidade } = await setupCompleto();
    vi.mocked(obterPerfilInstagram).mockRejectedValueOnce(new Error("rate limit da Graph API"));

    await processarEventoDoInstagram(db, {
      sender: { id: "ig-cliente-perfil-2" },
      recipient: { id: "ig-conta-restaurante" },
      message: { mid: "mid-perfil-2", text: "Oi" },
    });
    await aguardarTurnoAgendado();

    const [conversa] = await db.select().from(conversas).where(eq(conversas.unidadeId, unidade.id));
    expect(conversa).toBeDefined();
    expect(conversa.nomeCliente).toBeNull();

    const mensagensDaConversa = await db.select().from(mensagens).where(eq(mensagens.conversaId, conversa.id));
    expect(mensagensDaConversa.length).toBeGreaterThan(0);
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

  it("nao pausa quando o echo do PROPRIO envio chega ANTES da mensagem estar gravada (doc 26 - condicao de corrida real)", async () => {
    // Simula exatamente a corrida que causava auto-pausa: o webhook de echo chega
    // (ou e processado) antes do insert em enviarRespostaDoAgente terminar. O guard
    // em memoria (marcado de forma sincrona assim que o Instagram confirma o envio,
    // antes de qualquer await) precisa impedir a pausa mesmo sem NENHUMA linha em
    // "mensagens" pra esse mid ainda existir.
    const { unidade } = await setupCompleto();
    await processarEventoDoInstagram(db, {
      sender: { id: "ig-cliente-1" },
      recipient: { id: "ig-conta-restaurante" },
      message: { mid: "mid-cliente-1", text: "quero uma mesa" },
    });

    marcarComoEnviadoPeloAgente("mid-em-corrida");
    await processarEventoDoInstagram(db, {
      sender: { id: "ig-conta-restaurante" },
      recipient: { id: "ig-cliente-1" },
      message: { mid: "mid-em-corrida", text: "Resposta automatica do agente", is_echo: true },
    });

    const [conversa] = await db.select().from(conversas).where(eq(conversas.unidadeId, unidade.id));
    expect(conversa.agentPaused).toBe(false);
    // o echo em corrida nao deve ter inserido nada (o insert de verdade vem de
    // enviarRespostaDoAgente, ainda por acontecer quando o turno agendado disparar).
    const semDuplicata = await db
      .select()
      .from(mensagens)
      .where(and(eq(mensagens.conversaId, conversa.id), eq(mensagens.igMessageId, "mid-em-corrida")));
    expect(semDuplicata).toHaveLength(0);

    // o turno real ainda dispara e entrega a resposta normalmente depois.
    await aguardarTurnoAgendado();
    const [conversaDepois] = await db.select().from(conversas).where(eq(conversas.unidadeId, unidade.id));
    expect(conversaDepois.agentPaused).toBe(false);
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
