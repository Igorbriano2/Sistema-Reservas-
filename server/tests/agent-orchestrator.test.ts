import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { conversas } from "../src/db/schema/index.js";
import { executarTurnoDoAgente, type MessagesCreateFn } from "../src/modules/agent/orchestrator.js";
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

// Cast via unknown de proposito: sao objetos de teste minimos, so com os campos que
// o orchestrator realmente le (content/stop_reason) - nao acompanham cada campo novo
// que a Anthropic.Message ganha em atualizacoes do SDK (usage detalhado, citations, etc).
function respostaDeTexto(texto: string): Anthropic.Message {
  return {
    id: "msg_fake",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
    content: [{ type: "text", text: texto }],
    stop_reason: "end_turn",
  } as unknown as Anthropic.Message;
}

function respostaDeToolUse(toolUseId: string, nome: string, input: unknown): Anthropic.Message {
  return {
    id: "msg_fake_tool",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
    content: [{ type: "tool_use", id: toolUseId, name: nome, input }],
    stop_reason: "tool_use",
  } as unknown as Anthropic.Message;
}

async function setupUnidadeCompleta() {
  const { empresa, unidade } = await criarEmpresaComAdmin();
  const salao = await criarSalao(unidade.id);
  const mesa = await criarMesa(salao.id, { capacidadeMin: 1, capacidadeMax: 4 });
  await criarRegraHorarioTodosOsDias(unidade.id);
  return { empresa, unidade, salao, mesa };
}

describe("executarTurnoDoAgente (loop de tool use)", () => {
  it("responde diretamente com texto quando o modelo nao usa nenhuma tool", async () => {
    const { empresa, unidade } = await setupUnidadeCompleta();
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");
    const ctx: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-1", conversaId: conversa.id };

    const criarMensagem: MessagesCreateFn = vi.fn().mockResolvedValue(respostaDeTexto("Ola! Como posso ajudar?"));

    const texto = await executarTurnoDoAgente({
      db,
      ctx,
      systemPrompt: "system prompt de teste",
      historico: [],
      mensagemDoCliente: "oi",
      criarMensagem,
    });

    expect(texto).toBe("Ola! Como posso ajudar?");
    expect(criarMensagem).toHaveBeenCalledTimes(1);
  });

  it("executa check_availability (so informativo) e depois get_reservation_link de verdade, sem nunca criar reserva", async () => {
    const { empresa, unidade } = await setupUnidadeCompleta();
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");
    const ctx: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-1", conversaId: conversa.id };

    const criarMensagem: MessagesCreateFn = vi
      .fn()
      .mockResolvedValueOnce(
        respostaDeToolUse("tool_1", "check_availability", { data: "2026-11-01", hora: "19:00", num_pessoas: 2 }),
      )
      .mockResolvedValueOnce(respostaDeToolUse("tool_2", "get_reservation_link", {}))
      .mockResolvedValueOnce(respostaDeTexto("Temos horario livre! Aqui esta seu link para reservar: (link)"));

    const texto = await executarTurnoDoAgente({
      db,
      ctx,
      systemPrompt: "system prompt de teste",
      historico: [],
      mensagemDoCliente: "quero reservar para 2 pessoas hoje as 19h",
      criarMensagem,
    });

    expect(texto).toBe("Temos horario livre! Aqui esta seu link para reservar: (link)");
    expect(criarMensagem).toHaveBeenCalledTimes(3);

    // A segunda chamada deve conter o tool_result da primeira (disponibilidade) como contexto.
    const segundaChamada = (criarMensagem as ReturnType<typeof vi.fn>).mock.calls[1][0] as Anthropic.MessageCreateParamsNonStreaming;
    const ultimaMensagem = segundaChamada.messages.at(-1)!;
    expect(ultimaMensagem.role).toBe("user");
    expect(JSON.stringify(ultimaMensagem.content)).toContain("disponivel");

    // A terceira chamada deve conter o link gerado pela segunda tool.
    const terceiraChamada = (criarMensagem as ReturnType<typeof vi.fn>).mock.calls[2][0] as Anthropic.MessageCreateParamsNonStreaming;
    expect(JSON.stringify(terceiraChamada.messages.at(-1))).toContain("/reservar/");

    const reservas = await executarTool(db, ctx, "find_my_reservations", {
      nome_cliente: "Qualquer Um",
      telefone_cliente: "11900000000",
    });
    expect((reservas.output as { reservas: unknown[] }).reservas).toHaveLength(0);
  });

  it("interrompe apos o limite de iteracoes e escalona para humano em vez de entrar em loop infinito", async () => {
    const { empresa, unidade } = await setupUnidadeCompleta();
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");
    const ctx: AgentContext = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cliente-1", conversaId: conversa.id };

    const criarMensagem: MessagesCreateFn = vi
      .fn()
      .mockResolvedValue(respostaDeToolUse("tool_x", "find_my_reservations", {}));

    const texto = await executarTurnoDoAgente({
      db,
      ctx,
      systemPrompt: "system prompt de teste",
      historico: [],
      mensagemDoCliente: "insiste insiste insiste",
      criarMensagem,
    });

    expect(texto).toMatch(/atendente/i);

    const [atualizada] = await db.select().from(conversas).where(eq(conversas.id, conversa.id));
    expect(atualizada.agentPaused).toBe(true);
  });
});
