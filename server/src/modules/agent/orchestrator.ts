import type Anthropic from "@anthropic-ai/sdk";
import { env } from "../../config/env.js";
import type { Database } from "../../db/client.js";
import { getAnthropicClient } from "../../lib/anthropic-client.js";
import { obterToolsDoAgente } from "./tools.js";
import { executarTool } from "./tool-executor.js";
import type { AgentContext } from "./context.js";

export type MessagesCreateFn = (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;

// Numero maximo de idas-e-voltas de tool_use dentro de UM turno, evitando loop
// infinito caso o modelo insista em chamar tools sem nunca concluir.
const MAX_ITERACOES_DE_TOOL_USE = 6;
const MAX_TOKENS_RESPOSTA = 1024;

export interface ExecutarTurnoParams {
  db: Database;
  ctx: AgentContext;
  systemPrompt: string;
  // Turnos anteriores da conversa (so texto), sem a mensagem atual do cliente.
  historico: Anthropic.MessageParam[];
  mensagemDoCliente: string;
  // Injetavel para testes (ver tests/agent-orchestrator.test.ts); em producao usa a Claude API real.
  criarMensagem?: MessagesCreateFn;
}

function defaultCriarMensagem(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
  return getAnthropicClient().messages.create(params);
}

// Executa UM turno completo do agente: manda a mensagem do cliente pra Claude com
// as tools, executa quantos tool_use forem necessarios contra o Postgres, e volta
// com o texto final que deve ser enviado ao cliente no Instagram. Este e o UNICO
// lugar onde a conversa e decidida - nunca ha um caminho de resposta hardcoded.
export async function executarTurnoDoAgente(params: ExecutarTurnoParams): Promise<string> {
  const criarMensagem = params.criarMensagem ?? defaultCriarMensagem;

  // Reconstroi o array a cada iteracao (em vez de dar push no mesmo array) para que
  // cada chamada a criarMensagem receba/registre um snapshot proprio do historico -
  // relevante inclusive para os testes, que inspecionam os args de cada chamada mockada.
  let messages: Anthropic.MessageParam[] = [
    ...params.historico,
    { role: "user", content: params.mensagemDoCliente },
  ];
  // Fixado no inicio do turno (doc 17, parte 4): se o modelo resolver a unidade no
  // meio deste MESMO turno, as tools de reserva ainda ficam indisponiveis ate o
  // proximo turno (proxima mensagem do cliente) - suficiente pra nunca vazar
  // disponibilidade/link da unidade errada, e simples de raciocinar sobre.
  const tools = obterToolsDoAgente(params.ctx.unidadeId !== null);

  for (let iteracao = 0; iteracao < MAX_ITERACOES_DE_TOOL_USE; iteracao++) {
    const resposta = await criarMensagem({
      model: env.ANTHROPIC_MODEL,
      max_tokens: MAX_TOKENS_RESPOSTA,
      // Cache de prompt (doc 35): o system prompt e as tools sao IDENTICOS em toda
      // chamada desta mesma empresa/toolset (so o historico de mensagens muda) - sem
      // isso, cada uma das ate 6 idas-e-voltas de tool_use por turno, e cada novo
      // turno da mesma conversa, reenviava (e pagava o preco cheio de) esse bloco
      // fixo do zero. O marcador vai no ULTIMO bloco de cada um: a Claude API cacheia
      // cumulativamente tudo ATE ali (aqui, prompt inteiro + tools inteiras).
      system: [{ type: "text", text: params.systemPrompt, cache_control: { type: "ephemeral" } }],
      tools: tools.map((tool, i) => (i === tools.length - 1 ? { ...tool, cache_control: { type: "ephemeral" as const } } : tool)),
      messages,
    });

    const blocosDeTool = resposta.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (resposta.stop_reason !== "tool_use" || blocosDeTool.length === 0) {
      const texto = resposta.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return texto || "Desculpe, nao consegui gerar uma resposta agora. Um atendente vai te ajudar em breve.";
    }

    const resultados: Anthropic.ToolResultBlockParam[] = [];
    for (const bloco of blocosDeTool) {
      const resultado = await executarTool(params.db, params.ctx, bloco.name, bloco.input);
      resultados.push({
        type: "tool_result",
        tool_use_id: bloco.id,
        content: JSON.stringify(resultado.output),
        is_error: resultado.isError,
      });
    }

    messages = [
      ...messages,
      { role: "assistant", content: resposta.content },
      { role: "user", content: resultados },
    ];
  }

  // Excedeu o limite de iteracoes: encaminha para um humano em vez de deixar o
  // cliente sem resposta ou preso num loop.
  await executarTool(params.db, params.ctx, "escalate_to_human", {
    motivo: "Limite de chamadas a tools excedido em um unico turno",
  });
  return "Desculpe, tive dificuldade para concluir sua solicitacao agora. Vou chamar um atendente para te ajudar.";
}
