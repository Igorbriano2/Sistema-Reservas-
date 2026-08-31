import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import {
  agenteConfig,
  conversas,
  instagramConnections,
  mensagens,
  unidades,
  type Conversa,
  type InstagramConnection,
  type PapelMensagem,
} from "../../db/schema/index.js";
import { montarSystemPrompt, montarSystemPromptResolucaoUnidade, type SystemPromptPartes } from "../../lib/agent-prompt.js";
import { enviarRespostaDoAgente, foiEnviadoPeloAgente } from "../../lib/instagram-notify.js";
import { preencherPerfilClienteEmSegundoPlano } from "../../lib/instagram-profile.js";
import { transcreverAudioDoInstagram } from "../../lib/audio-transcription.js";
import { executarTurnoDoAgente } from "./orchestrator.js";
import { executarTool } from "./tool-executor.js";
import { agendarTurnoDoAgente } from "./debounce.js";
import type { AgentContext } from "./context.js";

// Usado quando a chamada a IA (Anthropic/OpenAI) falha de forma inesperada (ver
// catch em processarTurnoAgrupado abaixo) - deliberadamente NAO promete escalonamento
// (esse caminho nao pausa a conversa nem chama um humano, ver comentario la), pra nao
// mentir pro cliente. Diferente do texto usado no limite de iteracoes de tool_use
// (orchestrator.ts), que ai sim escala de verdade.
const MENSAGEM_ERRO_INESPERADO = "Desculpe, tive um problema para concluir sua solicitacao agora. Pode repetir sua mensagem?";

// Doc 42 - quando o audio recebido nao pode ser transcrito (sem OPENAI_API_KEY
// configurada, download falhou, transcricao veio vazia etc).
const MENSAGEM_AUDIO_NAO_TRANSCRITO = "Desculpe, não consegui entender o áudio agora. Pode escrever a mensagem em texto?";

export interface InstagramMessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    // Doc 42 - mensagem de voz: a Meta so manda o tipo + uma URL temporaria pro
    // arquivo (nunca o audio em si) - outros tipos possiveis (image/video/file) sao
    // ignorados de proposito, so audio e tratado por enquanto.
    attachments?: Array<{ type?: string; payload?: { url?: string } }>;
  };
}

const HISTORICO_MAX_MENSAGENS = 20;
// Janela de leitura ao montar o turno agrupado: precisa cobrir o historico normal MAIS
// as mensagens da rajada ainda nao respondidas (normalmente poucas, mas sem limite fixo
// de quantas podem chegar durante a espera do debounce).
const JANELA_TURNO_PENDENTE = HISTORICO_MAX_MENSAGENS + 20;

// Devolve null quando a conexao e compartilhada (unidade_id nulo) e a empresa tem
// mais de uma unidade - a partir de doc 17 parte 4, isso NAO e mais um erro: a
// conversa nasce "pendente" e o agente pergunta ao cliente qual unidade ele quer (ver
// montarSystemPromptResolucaoUnidade / tool resolver_unidade_da_conversa).
async function resolverUnidadeDaConexao(db: Database, conexao: InstagramConnection): Promise<string | null> {
  if (conexao.unidadeId) {
    return conexao.unidadeId;
  }
  const lista = await db.select({ id: unidades.id }).from(unidades).where(eq(unidades.empresaId, conexao.empresaId));
  return lista.length === 1 ? lista[0].id : null;
}

// Uma linha por (empresa, sender) - nao mais por unidade, ja que a unidade pode ainda
// nao estar resolvida quando a conversa nasce. unidadeIdSugerido so e usado na
// primeira mensagem (INSERT); se a conversa ja existe, o unidade_id ja gravado nela
// (resolvido ou ainda pendente) prevalece, nunca e sobrescrito aqui.
async function buscarOuCriarConversa(
  db: Database,
  empresaId: string,
  unidadeIdSugerido: string | null,
  igSenderId: string,
): Promise<Conversa> {
  const condicao = and(eq(conversas.empresaId, empresaId), eq(conversas.igSenderId, igSenderId));

  const [existente] = await db.select().from(conversas).where(condicao).limit(1);
  if (existente) return existente;

  const [nova] = await db
    .insert(conversas)
    .values({ empresaId, unidadeId: unidadeIdSugerido, igSenderId })
    .onConflictDoNothing()
    .returning();
  if (nova) {
    // Doc 33 - conversa nova de verdade (nao uma corrida): busca nome/foto do cliente
    // em segundo plano, sem atrasar o resto do processamento do evento.
    preencherPerfilClienteEmSegundoPlano(db, nova);
    return nova;
  }

  // Corrida: outra requisicao concorrente criou a conversa entre o select e o insert.
  const [existenteAposCorrida] = await db.select().from(conversas).where(condicao).limit(1);
  return existenteAposCorrida;
}

interface TurnoPendente {
  historico: Array<{ role: "user" | "assistant"; content: string }>;
  mensagemAgrupada: string | null;
}

// Roda quando o debounce dispara: junta todas as mensagens "user" ainda nao respondidas
// (a rajada inteira) num unico texto, e usa o restante como historico normal - assim o
// agente ve a rajada como UM pedido so, e responde uma unica vez pra ela.
async function carregarTurnoPendente(db: Database, conversaId: string): Promise<TurnoPendente> {
  const linhas = await db
    .select({ papel: mensagens.papel, conteudo: mensagens.conteudo })
    .from(mensagens)
    .where(eq(mensagens.conversaId, conversaId))
    .orderBy(desc(mensagens.criadoEm))
    .limit(JANELA_TURNO_PENDENTE);

  const pendentes: string[] = [];
  let i = 0;
  for (; i < linhas.length; i++) {
    if (linhas[i].papel !== "user") break;
    pendentes.unshift(linhas[i].conteudo);
  }

  const historico = linhas
    .slice(i, i + HISTORICO_MAX_MENSAGENS)
    .reverse()
    .map((m) => ({ role: m.papel as PapelMensagem, content: m.conteudo }));

  return { historico, mensagemAgrupada: pendentes.length > 0 ? pendentes.join("\n") : null };
}

// Executado (com atraso, via debounce) depois que uma rajada de mensagens para de
// chegar. Recarrega tudo do zero a partir do banco - nunca reaproveita estado de quando
// o turno foi agendado - porque a conversa pode ter mudado nesse meio tempo (ex.: um
// humano assumiu pela Meta Business Suite enquanto o agente estava "esperando").
async function processarTurnoAgrupado(db: Database, ctx: AgentContext): Promise<void> {
  const [conversaAtual] = await db.select().from(conversas).where(eq(conversas.id, ctx.conversaId)).limit(1);
  if (!conversaAtual || conversaAtual.agentPaused) {
    return;
  }

  const [config] = await db.select().from(agenteConfig).where(eq(agenteConfig.empresaId, ctx.empresaId)).limit(1);
  if (!config) {
    console.error(`[webhook] agente_config ausente para a empresa ${ctx.empresaId}`);
    return;
  }

  // Doc 17, parte 4: sem unidade resolvida ainda, o agente so pergunta qual unidade o
  // cliente quer (system prompt + tools bem mais restritos - ver montarSystemPrompt
  // ResolucaoUnidade e obterToolsDoAgente).
  let systemPrompt: SystemPromptPartes;
  if (ctx.unidadeId) {
    const [unidade] = await db.select().from(unidades).where(eq(unidades.id, ctx.unidadeId)).limit(1);
    if (!unidade) {
      console.error(`[webhook] unidade ${ctx.unidadeId} ausente para a empresa ${ctx.empresaId}`);
      return;
    }
    systemPrompt = montarSystemPrompt(config, unidade);
  } else {
    const listaUnidades = await db
      .select({ id: unidades.id, nome: unidades.nome })
      .from(unidades)
      .where(eq(unidades.empresaId, ctx.empresaId));
    systemPrompt = montarSystemPromptResolucaoUnidade(config, listaUnidades);
  }

  const { historico, mensagemAgrupada } = await carregarTurnoPendente(db, ctx.conversaId);
  if (!mensagemAgrupada) {
    return; // nada pendente (nao deveria acontecer, mas evita chamar o agente a toa)
  }

  // Qualquer erro NAO tratado aqui dentro (uma excecao real do Postgres, ou - o caso
  // mais comum na pratica - uma instabilidade transitoria da propria API da Anthropic/
  // OpenAI: rate limit, timeout, incidente do provedor) antes derrubava o turno
  // inteiro em silencio: sem resposta ao cliente, sem pausar a conversa, so um
  // console.error no .catch do debounce - a mensagem do cliente sumia sem nenhum
  // sinal pra ninguem. Corrigido pra pelo menos responder (ver MENSAGEM_ERRO_
  // INESPERADO acima) - mas DELIBERADAMENTE sem chamar escalate_to_human aqui: isso
  // pausaria a conversa ate um humano clicar "Reativar agente" no painel, e um erro
  // de API costuma ser passageiro (o provedor volta sozinho em minutos/horas) - sem
  // esse cuidado, um incidente de alguns minutos na Anthropic/OpenAI travava a
  // conversa de todo cliente que mandou mensagem nessa janela ATE ALGUEM REPARAR e
  // reativar manualmente, mesmo horas depois do provedor ja ter voltado ao normal.
  // Deixando a conversa ativa, a proxima mensagem do cliente aciona uma tentativa
  // nova e normal. Escalonamento de verdade continua acontecendo nos casos que
  // realmente precisam de um humano: limite de iteracoes de tool_use (orchestrator.ts)
  // e decisao do proprio modelo de chamar a tool escalate_to_human.
  let respostaTexto: string;
  try {
    respostaTexto = await executarTurnoDoAgente({
      db,
      ctx,
      systemPrompt,
      historico,
      mensagemDoCliente: mensagemAgrupada,
    });
  } catch (err) {
    console.error(`[agente] erro inesperado processando turno da conversa ${ctx.conversaId}:`, err);
    respostaTexto = MENSAGEM_ERRO_INESPERADO;
  }

  try {
    await enviarRespostaDoAgente(db, {
      unidadeId: ctx.unidadeId,
      empresaId: ctx.empresaId,
      igSenderId: ctx.igSenderId,
      conversaId: ctx.conversaId,
      texto: respostaTexto,
    });
  } catch (err) {
    // Antes, uma falha aqui (ex.: token do Instagram expirado, conexao removida)
    // derrubava a promise sem tratamento nenhum - o cliente ficava sem resposta E
    // ninguem da equipe era avisado (so um console.error perdido nos logs da
    // DigitalOcean). Agora escala como qualquer outra falha real do turno: pausa a
    // conversa e dispara push pro dono/funcionario, que consegue notar e reconectar
    // o Instagram pelo painel.
    console.error(`[agente] erro ao enviar a resposta pro Instagram (conversa ${ctx.conversaId}):`, err);
    await executarTool(db, ctx, "escalate_to_human", {
      motivo: "Falha ao enviar a resposta pelo Instagram - a conexao pode ter expirado",
    });
  }
}

// Processa UM evento de mensagem do webhook do Instagram: identifica a empresa/unidade
// pela conta que recebeu a mensagem, distingue mensagem real de cliente vs. echo (que
// pode ser o proprio agente ou um humano na Meta Business Suite), grava tudo no
// historico imediatamente, e agenda (com debounce) o turno do agente quando fizer
// sentido responder automaticamente - nunca aciona a Claude API diretamente aqui, pra
// nao responder mensagem por mensagem numa rajada rapida.
export async function processarEventoDoInstagram(db: Database, evento: InstagramMessagingEvent): Promise<void> {
  const mensagem = evento.message;
  // Numa mensagem normal do cliente, sender = cliente e recipient = conta do restaurante.
  // Num echo (mensagem enviada PELA conta do restaurante, seja pelo agente ou por um
  // humano na Meta Business Suite), a Meta inverte: sender = conta do restaurante e
  // recipient = cliente. Sem tratar isso, um echo faria a busca pela conexao com o
  // ID do cliente em vez da conta do restaurante, e nunca encontraria nada.
  const ehEcho = mensagem?.is_echo === true;
  const igBusinessAccountId = ehEcho ? evento.sender?.id : evento.recipient?.id;
  const igSenderId = ehEcho ? evento.recipient?.id : evento.sender?.id;

  // Doc 42 - mensagem de voz: unico tipo de midia tratado por enquanto (imagem/video/
  // arquivo continuam ignorados, igual antes).
  const anexoDeAudio = mensagem?.attachments?.find((a) => a?.type === "audio" && a.payload?.url);

  if (!igBusinessAccountId || !igSenderId || !mensagem || (!mensagem.text && !anexoDeAudio)) {
    return; // ignora delivery/read receipts e mensagens sem texto nem audio (outras midias ficam pra depois)
  }

  const [conexao] = await db
    .select()
    .from(instagramConnections)
    .where(
      and(eq(instagramConnections.igBusinessAccountId, igBusinessAccountId), eq(instagramConnections.status, "ativo")),
    )
    .limit(1);

  if (!conexao) {
    console.warn(`[webhook] Nenhuma conexao ativa para a conta do Instagram ${igBusinessAccountId}`);
    return;
  }

  // unidadeSugerida so vale pra CRIAR a conversa (primeira mensagem); se ela ja
  // existir, o unidade_id ja gravado nela prevalece (resolvido ou ainda pendente).
  const unidadeSugerida = await resolverUnidadeDaConexao(db, conexao);
  const conversa = await buscarOuCriarConversa(db, conexao.empresaId, unidadeSugerida, igSenderId);

  if (mensagem.is_echo) {
    // Echo de uma mensagem enviada PELA conta do restaurante. Se for o proprio agente
    // (guard em memoria de instagram-notify.ts, ver comentario la - fecha uma corrida
    // real onde esse echo podia chegar ANTES da gente gravar o mid, fazendo o agente
    // se auto-pausar): nada a fazer aqui, o insert de verdade (papel assistant, sem
    // enviadoPorHumano) ja acontece em enviarRespostaDoAgente.
    if (mensagem.mid && foiEnviadoPeloAgente(mensagem.mid)) {
      return;
    }

    // Se o mid corresponde a uma mensagem que o agente ja gravou normalmente (sem
    // corrida), o insert abaixo colide com o unique index e e ignorado
    // (onConflictDoNothing) - nada a fazer. Se nao corresponde a nenhuma, foi um
    // humano respondendo pela Meta Business Suite: registra e pausa o agente.
    // Doc 42 - echo de audio (humano mandou uma mensagem de voz pelo proprio Instagram,
    // nao pelo painel) nunca precisa ser transcrito: e a nossa propria saida, ninguem
    // vai perguntar pro agente o que ela diz - so guarda um marcador no historico.
    const [inserida] = await db
      .insert(mensagens)
      .values({
        conversaId: conversa.id,
        papel: "assistant",
        conteudo: mensagem.text ?? "[Áudio enviado]",
        igMessageId: mensagem.mid,
        enviadoPorHumano: true,
      })
      .onConflictDoNothing({ target: mensagens.igMessageId, where: sql`${mensagens.igMessageId} is not null` })
      .returning();

    if (inserida) {
      await db
        .update(conversas)
        .set({ agentPaused: true, ultimaAtividadeHumanaEm: new Date() })
        .where(eq(conversas.id, conversa.id));
    }
    return;
  }

  // Doc 42 - mensagem de voz do cliente: transcreve ANTES de seguir o fluxo normal,
  // pra o resto do pipeline (historico, debounce, agente, tools) nunca precisar saber
  // que a mensagem original nao era texto - ele so ve o texto transcrito, igual
  // qualquer outra mensagem.
  const textoDoCliente = mensagem.text ?? (anexoDeAudio ? await transcreverAudioDoInstagram(anexoDeAudio.payload!.url!) : null);

  if (!textoDoCliente) {
    console.warn(`[webhook] audio de ${igSenderId} nao pode ser transcrito`);
    if (!conversa.agentPaused) {
      try {
        await enviarRespostaDoAgente(db, {
          unidadeId: conversa.unidadeId,
          empresaId: conexao.empresaId,
          igSenderId,
          conversaId: conversa.id,
          texto: MENSAGEM_AUDIO_NAO_TRANSCRITO,
        });
      } catch (err) {
        console.error(`[webhook] erro ao avisar sobre audio nao transcrito (conversa ${conversa.id}):`, err);
      }
    }
    return;
  }

  const [mensagemInserida] = await db
    .insert(mensagens)
    .values({ conversaId: conversa.id, papel: "user", conteudo: textoDoCliente, igMessageId: mensagem.mid })
    .onConflictDoNothing({ target: mensagens.igMessageId, where: sql`${mensagens.igMessageId} is not null` })
    .returning();

  if (!mensagemInserida) {
    return; // reentrega do mesmo evento (mid ja processado) - Meta garante "pelo menos uma vez"
  }

  if (conversa.agentPaused) {
    return; // um humano assumiu esta conversa; nao responde automaticamente ate reativacao manual
  }

  const ctx: AgentContext = { empresaId: conexao.empresaId, unidadeId: conversa.unidadeId, igSenderId, conversaId: conversa.id };
  agendarTurnoDoAgente(conversa.id, () => processarTurnoAgrupado(db, ctx));
}
