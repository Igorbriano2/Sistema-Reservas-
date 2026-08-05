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
} from "../../db/schema/index.js";
import { env } from "../../config/env.js";
import { decrypt } from "../../lib/crypto.js";
import { enviarMensagemInstagram } from "../../lib/instagram-api.js";
import { montarSystemPrompt } from "../../lib/agent-prompt.js";
import { executarTurnoDoAgente } from "./orchestrator.js";
import type { AgentContext } from "./context.js";

export interface InstagramMessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: { mid?: string; text?: string; is_echo?: boolean };
}

const HISTORICO_MAX_MENSAGENS = 20;

async function resolverUnidadeDaConexao(db: Database, conexao: InstagramConnection): Promise<string | null> {
  if (conexao.unidadeId) {
    return conexao.unidadeId;
  }
  // Conexao "da empresa toda" (sem unidade fixa): so da pra resolver sozinha se a
  // empresa tiver exatamente uma unidade. Com mais de uma, e config ambigua - melhor
  // nao adivinhar (mensagem fica sem resposta automatica) do que responder na unidade errada.
  const lista = await db.select({ id: unidades.id }).from(unidades).where(eq(unidades.empresaId, conexao.empresaId));
  return lista.length === 1 ? lista[0].id : null;
}

async function buscarOuCriarConversa(
  db: Database,
  empresaId: string,
  unidadeId: string,
  igSenderId: string,
): Promise<Conversa> {
  const condicao = and(eq(conversas.unidadeId, unidadeId), eq(conversas.igSenderId, igSenderId));

  const [existente] = await db.select().from(conversas).where(condicao).limit(1);
  if (existente) return existente;

  const [nova] = await db
    .insert(conversas)
    .values({ empresaId, unidadeId, igSenderId })
    .onConflictDoNothing()
    .returning();
  if (nova) return nova;

  // Corrida: outra requisicao concorrente criou a conversa entre o select e o insert.
  const [existenteAposCorrida] = await db.select().from(conversas).where(condicao).limit(1);
  return existenteAposCorrida;
}

async function carregarHistoricoRecente(db: Database, conversaId: string) {
  const linhas = await db
    .select({ papel: mensagens.papel, conteudo: mensagens.conteudo })
    .from(mensagens)
    .where(eq(mensagens.conversaId, conversaId))
    .orderBy(desc(mensagens.criadoEm))
    .limit(HISTORICO_MAX_MENSAGENS);

  return linhas.reverse().map((m) => ({ role: m.papel, content: m.conteudo }));
}

// Processa UM evento de mensagem do webhook do Instagram: identifica a empresa/unidade
// pela conta que recebeu a mensagem, distingue mensagem real de cliente vs. echo (que
// pode ser o proprio agente ou um humano na Meta Business Suite), e so entao aciona
// o agente via Claude API quando fizer sentido responder automaticamente.
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

  if (!igBusinessAccountId || !igSenderId || !mensagem?.text) {
    return; // ignora delivery/read receipts e mensagens sem texto (midia fica para depois do MVP)
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

  const unidadeId = await resolverUnidadeDaConexao(db, conexao);
  if (!unidadeId) {
    console.error(`[webhook] Nao foi possivel resolver a unidade da conexao ${conexao.id} (empresa ${conexao.empresaId})`);
    return;
  }

  const conversa = await buscarOuCriarConversa(db, conexao.empresaId, unidadeId, igSenderId);

  if (mensagem.is_echo) {
    // Echo de uma mensagem enviada PELA conta do restaurante. Se o mid corresponde a
    // uma mensagem que o agente mandou, o insert abaixo colide com o unique index e e
    // ignorado (onConflictDoNothing) - nada a fazer. Se nao corresponde a nenhuma, foi
    // um humano respondendo pela Meta Business Suite: registra e pausa o agente.
    const [inserida] = await db
      .insert(mensagens)
      .values({
        conversaId: conversa.id,
        papel: "assistant",
        conteudo: mensagem.text,
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

  const [mensagemInserida] = await db
    .insert(mensagens)
    .values({ conversaId: conversa.id, papel: "user", conteudo: mensagem.text, igMessageId: mensagem.mid })
    .onConflictDoNothing({ target: mensagens.igMessageId, where: sql`${mensagens.igMessageId} is not null` })
    .returning();

  if (!mensagemInserida) {
    return; // reentrega do mesmo evento (mid ja processado) - Meta garante "pelo menos uma vez"
  }

  if (conversa.agentPaused) {
    return; // um humano assumiu esta conversa; nao responde automaticamente ate reativacao manual
  }

  const [config] = await db.select().from(agenteConfig).where(eq(agenteConfig.empresaId, conexao.empresaId)).limit(1);
  const [unidade] = await db.select().from(unidades).where(eq(unidades.id, unidadeId)).limit(1);
  if (!config || !unidade) {
    console.error(`[webhook] agente_config ou unidade ausente para a empresa ${conexao.empresaId}`);
    return;
  }

  const historico = await carregarHistoricoRecente(db, conversa.id);
  const ctx: AgentContext = { empresaId: conexao.empresaId, unidadeId, igSenderId, conversaId: conversa.id };

  const respostaTexto = await executarTurnoDoAgente({
    db,
    ctx,
    systemPrompt: montarSystemPrompt(config, unidade),
    historico,
    mensagemDoCliente: mensagem.text,
  });

  if (!env.TOKEN_ENCRYPTION_KEY) {
    console.error("[webhook] TOKEN_ENCRYPTION_KEY nao configurada - resposta gerada mas nao enviada");
    return;
  }

  const accessToken = decrypt(conexao.accessTokenEncrypted, env.TOKEN_ENCRYPTION_KEY);
  const igMessageId = await enviarMensagemInstagram(accessToken, igSenderId, respostaTexto);

  await db.insert(mensagens).values({
    conversaId: conversa.id,
    papel: "assistant",
    conteudo: respostaTexto,
    igMessageId: igMessageId || null,
  });
}
