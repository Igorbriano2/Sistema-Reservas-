import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import { env } from "../../config/env.js";
import type { Database } from "../../db/client.js";
import { getAnthropicClient } from "../../lib/anthropic-client.js";
import { getOpenAiClient } from "../../lib/openai-client.js";
import type { SystemPromptPartes } from "../../lib/agent-prompt.js";
import { obterToolsDoAgente } from "./tools.js";
import { executarTool } from "./tool-executor.js";
import type { AgentContext } from "./context.js";

export type MessagesCreateFn = (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;
export type OpenAiChatCreateFn = (
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
) => Promise<OpenAI.Chat.ChatCompletion>;

// Numero maximo de idas-e-voltas de tool_use dentro de UM turno, evitando loop
// infinito caso o modelo insista em chamar tools sem nunca concluir. Vale pros dois
// provedores (Claude e o fallback OpenAI).
const MAX_ITERACOES_DE_TOOL_USE = 6;
const MAX_TOKENS_RESPOSTA = 1024;

export interface ExecutarTurnoParams {
  db: Database;
  ctx: AgentContext;
  systemPrompt: SystemPromptPartes;
  // Turnos anteriores da conversa (so texto), sem a mensagem atual do cliente.
  historico: Anthropic.MessageParam[];
  mensagemDoCliente: string;
  // Injetavel para testes (ver tests/agent-orchestrator.test.ts); em producao usa a Claude API real.
  criarMensagem?: MessagesCreateFn;
  // Idem, para o fallback via OpenAI (ver executarTurnoComOpenAi abaixo).
  criarMensagemOpenAi?: OpenAiChatCreateFn;
}

function defaultCriarMensagem(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
  return getAnthropicClient().messages.create(params);
}

function defaultCriarMensagemOpenAi(
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
): Promise<OpenAI.Chat.ChatCompletion> {
  return getOpenAiClient().chat.completions.create(params) as Promise<OpenAI.Chat.ChatCompletion>;
}

// Doc 39: a Claude API e sempre a primaria - so recorre a OpenAI quando a chamada a
// ela falha DE VERDADE (credito/billing insuficiente, rate limit, indisponibilidade,
// etc.) e uma OPENAI_API_KEY estiver configurada. Sem a chave configurada, mantem o
// comportamento de sempre: propaga o erro original pro catch-all de process-event.ts
// (que ja avisa o cliente e escala pra humano). Isso e o UNICO lugar onde a escolha
// de provedor e decidida - o resto do agente (tools, prompt, historico) e identico
// pros dois, o restaurante nunca percebe qual das duas IAs respondeu.
export async function executarTurnoDoAgente(params: ExecutarTurnoParams): Promise<string> {
  try {
    return await executarTurnoComAnthropic(params);
  } catch (err) {
    if (!env.OPENAI_API_KEY) {
      throw err;
    }
    console.error(
      `[agente] Claude API falhou, usando fallback via OpenAI (conversa ${params.ctx.conversaId}):`,
      err,
    );
    return await executarTurnoComOpenAi(params);
  }
}

// Executa UM turno completo do agente contra a Claude API: manda a mensagem do
// cliente com as tools, executa quantos tool_use forem necessarios contra o
// Postgres, e volta com o texto final que deve ser enviado ao cliente no Instagram.
async function executarTurnoComAnthropic(params: ExecutarTurnoParams): Promise<string> {
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
      // Cache de prompt (doc 35, corrigido no doc 39): o bloco "cacheavel" do system
      // prompt e as tools sao IDENTICOS em toda chamada desta mesma empresa/toolset
      // (so o historico de mensagens muda) - sem isso, cada uma das ate 6
      // idas-e-voltas de tool_use por turno, e cada novo turno da mesma conversa,
      // reenviava (e pagava o preco cheio de) esse bloco fixo do zero. O marcador vai
      // no ULTIMO bloco cacheavel: a Claude API cacheia cumulativamente tudo ATE ali
      // (aqui, prompt inteiro + tools inteiras). O bloco "volatil" (so a data/hora
      // atual) vai DEPOIS, sem cache_control - ver comentario em agent-prompt.ts pra
      // por que ele NUNCA pode entrar no bloco cacheado (muda a cada minuto, e
      // invalidava o cache em quase toda chamada em producao).
      system: params.systemPrompt.volatil
        ? [
            { type: "text", text: params.systemPrompt.cacheavel, cache_control: { type: "ephemeral" } },
            { type: "text", text: params.systemPrompt.volatil },
          ]
        : [{ type: "text", text: params.systemPrompt.cacheavel, cache_control: { type: "ephemeral" } }],
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

// Converte o schema de tool do formato Anthropic (definido uma unica vez em
// tools.ts, fonte de verdade pros dois provedores) pro formato "function calling" da
// OpenAI - so muda o envelope; o input_schema (JSON Schema) e reaproveitado sem
// nenhuma alteracao, entao os dois provedores validam exatamente as mesmas tools.
function paraFerramentasOpenAi(tools: Anthropic.Tool[]): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema as Record<string, unknown>,
    },
  }));
}

// Mesmo loop de tool-use de executarTurnoComAnthropic acima, so que contra a Chat
// Completions API da OpenAI - usado UNICAMENTE como fallback (ver executarTurnoDo
// Agente) quando a chamada primaria a Claude API falha. Reaproveita as mesmas tools
// (so o envelope do schema muda) e o mesmo executarTool (provider-agnostic: so
// recebe nome+input+contexto, nunca sabe qual IA chamou).
async function executarTurnoComOpenAi(params: ExecutarTurnoParams): Promise<string> {
  const criarMensagem = params.criarMensagemOpenAi ?? defaultCriarMensagemOpenAi;
  const tools = paraFerramentasOpenAi(obterToolsDoAgente(params.ctx.unidadeId !== null));

  // historico (Anthropic.MessageParam[]) so guarda role+content em texto puro (ver
  // carregarTurnoPendente em process-event.ts) - nunca blocos estruturados - entao a
  // conversao pra OpenAI e direta, sem perda de informacao.
  // OpenAI cacheia automaticamente prefixos repetidos (sem cache_control manual) -
  // aqui os dois blocos so precisam virar UMA mensagem de sistema, sem risco de
  // invalidar cache proposital (esse fallback so roda em raras excecoes, nao no
  // caminho comum de custo).
  const systemPromptCompleto = [params.systemPrompt.cacheavel, params.systemPrompt.volatil].filter(Boolean).join("\n\n");
  let messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPromptCompleto },
    ...params.historico.map(
      (m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : "" }) as OpenAI.Chat.ChatCompletionMessageParam,
    ),
    { role: "user", content: params.mensagemDoCliente },
  ];

  for (let iteracao = 0; iteracao < MAX_ITERACOES_DE_TOOL_USE; iteracao++) {
    const resposta = await criarMensagem({
      model: env.OPENAI_MODEL,
      max_tokens: MAX_TOKENS_RESPOSTA,
      tools,
      messages,
    });

    const mensagemResposta = resposta.choices[0]?.message;
    const chamadasDeTool = mensagemResposta?.tool_calls ?? [];

    if (resposta.choices[0]?.finish_reason !== "tool_calls" || chamadasDeTool.length === 0) {
      const texto = (mensagemResposta?.content ?? "").trim();
      return texto || "Desculpe, nao consegui gerar uma resposta agora. Um atendente vai te ajudar em breve.";
    }

    messages = [...messages, mensagemResposta as OpenAI.Chat.ChatCompletionMessageParam];

    for (const chamada of chamadasDeTool) {
      // O SDK tipa tool_calls como uniao entre "function" (o unico tipo que o agente
      // usa - ver paraFerramentasOpenAi acima, sempre gera tools type:"function") e um
      // tipo "custom" mais novo que este app nunca declara - a guarda e so pra
      // satisfazer o TypeScript, nunca deveria cair no else na pratica.
      if (chamada.type !== "function") {
        messages.push({ role: "tool", tool_call_id: chamada.id, content: JSON.stringify({ erro: "Tipo de tool_call nao suportado" }) });
        continue;
      }
      let input: unknown = {};
      try {
        input = JSON.parse(chamada.function.arguments || "{}");
      } catch {
        input = {};
      }
      const resultado = await executarTool(params.db, params.ctx, chamada.function.name, input);
      messages.push({ role: "tool", tool_call_id: chamada.id, content: JSON.stringify(resultado.output) });
    }
  }

  await executarTool(params.db, params.ctx, "escalate_to_human", {
    motivo: "Limite de chamadas a tools excedido em um unico turno (fallback OpenAI)",
  });
  return "Desculpe, tive dificuldade para concluir sua solicitacao agora. Vou chamar um atendente para te ajudar.";
}
