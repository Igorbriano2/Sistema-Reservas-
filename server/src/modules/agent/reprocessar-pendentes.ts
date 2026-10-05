import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { conversas, instagramConnections, mensagens } from "../../db/schema/index.js";
import { env } from "../../config/env.js";
import { decrypt } from "../../lib/crypto.js";
import { InstagramAuthError } from "../../lib/instagram-api.js";
import { processarEventoDoInstagram } from "./process-event.js";

const GRAPH_API_VERSION = "v21.0";
// O Instagram so aceita mensagem automatica ate 24h depois da ultima mensagem do
// cliente - margem de folga pra resposta (debounce + agente) ainda sair dentro dela.
const JANELA_DE_RESPOSTA_MS = 23.5 * 60 * 60 * 1000;

export type StatusReprocessamento = "respondendo" | "seria_respondida" | "atendente_assumiu" | "fora_da_janela_24h" | "sem_texto";

export interface ResultadoReprocessamento {
  username: string | null;
  igSenderId: string;
  mensagensSemResposta: number;
  status: StatusReprocessamento;
}

interface MensagemIg {
  id: string;
  fromId: string | null;
  texto: string | null;
  criadaEm: Date;
}

interface ConversaIg {
  participanteId: string | null;
  participanteUsername: string | null;
  // Mais recente primeiro (ordem devolvida pela Graph API).
  mensagens: MensagemIg[];
}

async function listarConversasRecentes(accessToken: string, contaId: string, desde: Date): Promise<ConversaIg[]> {
  const resultado: ConversaIg[] = [];
  let url: string | null =
    `https://graph.instagram.com/${GRAPH_API_VERSION}/me/conversations?platform=instagram&limit=50` +
    `&fields=updated_time,participants,messages.limit(20){id,from,message,created_time}`;

  for (let pagina = 0; url && pagina < 10; pagina++) {
    const resposta: Response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!resposta.ok) {
      const corpo = await resposta.text();
      if (resposta.status === 401 || /"code"\s*:\s*190/.test(corpo) || /OAuthException/.test(corpo)) {
        throw new InstagramAuthError(`Token do Instagram invalido/expirado (${resposta.status}): ${corpo}`);
      }
      throw new Error(`Falha ao listar conversas do Instagram (${resposta.status}): ${corpo}`);
    }
    const dados = (await resposta.json()) as {
      data?: Array<{
        updated_time: string;
        participants?: { data?: Array<{ id: string; username?: string }> };
        messages?: { data?: Array<{ id: string; from?: { id?: string }; message?: string; created_time: string }> };
      }>;
      paging?: { next?: string };
    };

    let passouDoLimite = false;
    for (const item of dados.data ?? []) {
      if (new Date(item.updated_time) < desde) {
        passouDoLimite = true;
        break;
      }
      const participante = item.participants?.data?.find((p) => p.id !== contaId);
      resultado.push({
        participanteId: participante?.id ?? null,
        participanteUsername: participante?.username ?? null,
        mensagens: (item.messages?.data ?? []).map((m) => ({
          id: m.id,
          fromId: m.from?.id ?? null,
          texto: m.message?.trim() ? m.message : null,
          criadaEm: new Date(m.created_time),
        })),
      });
    }
    url = passouDoLimite ? null : (dados.paging?.next ?? null);
  }
  return resultado;
}

// Recupera directs que chegaram enquanto o webhook nao conseguia processa-los (banco
// fora do ar, conexao do Instagram expirada) - nesses casos a mensagem e descartada e
// so existe na caixa de entrada do Instagram. Busca as conversas cuja ultima mensagem e
// do cliente e reinjeta cada uma pelo MESMO caminho de um webhook normal
// (processarEventoDoInstagram), entao o agente responde como se a mensagem tivesse
// acabado de chegar. Conversas pausadas (atendente humano) e fora da janela de 24h
// ficam de fora.
export async function reprocessarDirectsSemResposta(
  db: Database,
  empresaId: string,
  opcoes: { dryRun?: boolean } = {},
): Promise<ResultadoReprocessamento[]> {
  if (!env.TOKEN_ENCRYPTION_KEY) {
    throw new Error("TOKEN_ENCRYPTION_KEY nao configurada");
  }
  const conexoes = await db
    .select()
    .from(instagramConnections)
    .where(and(eq(instagramConnections.empresaId, empresaId), eq(instagramConnections.status, "ativo")));

  const agora = Date.now();
  const resultados: ResultadoReprocessamento[] = [];

  for (const conexao of conexoes) {
    const token = decrypt(conexao.accessTokenEncrypted, env.TOKEN_ENCRYPTION_KEY);
    const conta = conexao.igBusinessAccountId;
    const recentes = await listarConversasRecentes(token, conta, new Date(agora - JANELA_DE_RESPOSTA_MS));

    for (const conversaIg of recentes) {
      const clienteId = conversaIg.participanteId;
      if (!clienteId) continue;

      const semResposta: MensagemIg[] = [];
      for (const m of conversaIg.mensagens) {
        if (m.fromId === conta) break;
        semResposta.push(m);
      }
      if (semResposta.length === 0) continue;
      semResposta.reverse();

      const base = { username: conversaIg.participanteUsername, igSenderId: clienteId, mensagensSemResposta: semResposta.length };
      if (agora - semResposta[semResposta.length - 1].criadaEm.getTime() > JANELA_DE_RESPOSTA_MS) {
        resultados.push({ ...base, status: "fora_da_janela_24h" });
        continue;
      }

      const [existente] = await db
        .select()
        .from(conversas)
        .where(and(eq(conversas.empresaId, empresaId), eq(conversas.igSenderId, clienteId)))
        .limit(1);
      if (existente?.agentPaused) {
        resultados.push({ ...base, status: "atendente_assumiu" });
        continue;
      }

      const comTexto = semResposta.filter((m) => m.texto);
      if (comTexto.length === 0) {
        resultados.push({ ...base, status: "sem_texto" });
        continue;
      }
      if (opcoes.dryRun) {
        resultados.push({ ...base, status: "seria_respondida" });
        continue;
      }

      // Se o webhook chegou a gravar a mensagem mas a resposta nao saiu (ex: envio
      // falhou com o token expirado), processarEventoDoInstagram ignoraria o mid
      // repetido e nao acionaria o agente - remove essas linhas "user" sem resposta
      // pra serem regravadas pelo caminho normal logo abaixo.
      if (existente) {
        await db.delete(mensagens).where(
          and(
            eq(mensagens.conversaId, existente.id),
            eq(mensagens.papel, "user"),
            inArray(mensagens.igMessageId, comTexto.map((m) => m.id)),
          ),
        );
      }
      for (const m of comTexto) {
        await processarEventoDoInstagram(db, {
          sender: { id: clienteId },
          recipient: { id: conta },
          message: { mid: m.id, text: m.texto! },
        });
      }
      resultados.push({ ...base, status: "respondendo" });
    }
  }

  return resultados;
}
