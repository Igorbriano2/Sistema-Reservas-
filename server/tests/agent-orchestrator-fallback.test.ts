import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { conversas } from "../src/db/schema/index.js";
import type { AgentContext } from "../src/modules/agent/context.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
import { criarConversa, criarMesa, criarRegraHorarioTodosOsDias, criarSalao } from "./helpers/fixtures.js";

const SYSTEM_PROMPT_TESTE = { cacheavel: "system prompt de teste", volatil: "" };

beforeEach(async () => {
  await truncateAll();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

afterAll(async () => {
  await closeDb();
});

async function setupUnidadeCompleta() {
  const { empresa, unidade } = await criarEmpresaComAdmin();
  const salao = await criarSalao(unidade.id);
  await criarMesa(salao.id, { capacidadeMin: 1, capacidadeMax: 4 });
  await criarRegraHorarioTodosOsDias(unidade.id);
  return { empresa, unidade };
}

// Doc 39: quando a Claude API falha DE VERDADE (credito, rate limit, etc.) e uma
// OPENAI_API_KEY esta configurada, o agente tenta a OpenAI antes de desistir - a
// conversa continua sendo atendida em vez de cair no fallback de erro generico.
// vi.resetModules + import dinamico porque env.ts congela process.env num objeto no
// momento do import (mudar process.env depois nao afeta um modulo ja carregado).
describe("executarTurnoDoAgente - fallback pra OpenAI quando a Claude API falha (doc 39)", () => {
  it("usa a OpenAI quando a Claude API falha e OPENAI_API_KEY esta configurada", async () => {
    const { empresa, unidade } = await setupUnidadeCompleta();
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");
    const ctx: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-1", conversaId: conversa.id };

    vi.stubEnv("OPENAI_API_KEY", "sk-teste-fake");
    vi.resetModules();
    const { executarTurnoDoAgente } = await import("../src/modules/agent/orchestrator.js");

    const criarMensagemAnthropic = vi.fn().mockRejectedValue(new Error("credit balance is too low"));
    const criarMensagemOpenAi = vi.fn().mockResolvedValue({
      choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Oi! Posso ajudar (via OpenAI)." } }],
    });

    const texto = await executarTurnoDoAgente({
      db,
      ctx,
      systemPrompt: SYSTEM_PROMPT_TESTE,
      historico: [],
      mensagemDoCliente: "oi",
      criarMensagem: criarMensagemAnthropic,
      criarMensagemOpenAi,
    });

    expect(texto).toBe("Oi! Posso ajudar (via OpenAI).");
    expect(criarMensagemAnthropic).toHaveBeenCalledTimes(1);
    expect(criarMensagemOpenAi).toHaveBeenCalledTimes(1);

    // As tools mandadas pra OpenAI sao as MESMAS (so o envelope do schema muda).
    const argsOpenAi = criarMensagemOpenAi.mock.calls[0][0];
    const nomesDasTools = argsOpenAi.tools.map((t: { function: { name: string } }) => t.function.name);
    expect(nomesDasTools).toContain("check_availability");
    expect(nomesDasTools).toContain("get_horario_funcionamento");
  });

  it("executa tool_calls da OpenAI (fallback) contra o MESMO executarTool do Postgres", async () => {
    const { empresa, unidade } = await setupUnidadeCompleta();
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");
    const ctx: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-1", conversaId: conversa.id };

    vi.stubEnv("OPENAI_API_KEY", "sk-teste-fake");
    vi.resetModules();
    const { executarTurnoDoAgente } = await import("../src/modules/agent/orchestrator.js");

    const criarMensagemAnthropic = vi.fn().mockRejectedValue(new Error("credit balance is too low"));
    const criarMensagemOpenAi = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              content: null,
              tool_calls: [{ id: "call_1", type: "function", function: { name: "get_menu", arguments: "{}" } }],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Ainda nao temos cardapio cadastrado." } }],
      });

    const texto = await executarTurnoDoAgente({
      db,
      ctx,
      systemPrompt: SYSTEM_PROMPT_TESTE,
      historico: [],
      mensagemDoCliente: "qual o cardapio?",
      criarMensagem: criarMensagemAnthropic,
      criarMensagemOpenAi,
    });

    expect(texto).toBe("Ainda nao temos cardapio cadastrado.");
    expect(criarMensagemOpenAi).toHaveBeenCalledTimes(2);

    // A segunda chamada carrega o tool_result (role "tool") gerado pelo executarTool real.
    const segundaChamada = criarMensagemOpenAi.mock.calls[1][0];
    const mensagemDeTool = segundaChamada.messages.find((m: { role: string }) => m.role === "tool");
    expect(mensagemDeTool).toBeDefined();
    expect(JSON.parse(mensagemDeTool.content)).toEqual({ cardapio_disponivel: false });
  });

  it("sem OPENAI_API_KEY configurada, propaga o erro original da Claude API sem tentar fallback (comportamento anterior)", async () => {
    const { empresa, unidade } = await setupUnidadeCompleta();
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");
    const ctx: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-1", conversaId: conversa.id };

    vi.resetModules();
    const { executarTurnoDoAgente } = await import("../src/modules/agent/orchestrator.js");

    const criarMensagemAnthropic = vi.fn().mockRejectedValue(new Error("credit balance is too low"));
    const criarMensagemOpenAi = vi.fn();

    await expect(
      executarTurnoDoAgente({
        db,
        ctx,
        systemPrompt: SYSTEM_PROMPT_TESTE,
        historico: [],
        mensagemDoCliente: "oi",
        criarMensagem: criarMensagemAnthropic,
        criarMensagemOpenAi,
      }),
    ).rejects.toThrow("credit balance is too low");

    expect(criarMensagemOpenAi).not.toHaveBeenCalled();

    const [conversaAtual] = await db.select().from(conversas).where(eq(conversas.id, conversa.id));
    expect(conversaAtual.agentPaused).toBe(false); // quem trata/pausa e o catch em process-event.ts, nao aqui
  });
});
