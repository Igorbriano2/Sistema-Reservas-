import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { instagramConnections, mensagens } from "../db/schema/index.js";
import { env } from "../config/env.js";
import { decrypt } from "./crypto.js";
import { enviarMensagemInstagram, InstagramAuthError } from "./instagram-api.js";
import { buscarConexaoAtivaDaUnidade, buscarConexaoCompartilhadaDaEmpresa } from "./instagram-connection.js";

// Corrige uma condicao de corrida real: entre o Instagram confirmar o envio (devolve
// o mid) e a gente gravar esse mid em "mensagens", o webhook de echo do PROPRIO envio
// as vezes chega primeiro - e process-event.ts, sem achar o mid ainda gravado,
// concluia (errado) que foi um humano respondendo e pausava o agente pra sempre
// (ate reativacao manual). Um Set em memoria fecha a corrida: e preenchido de forma
// sincrona assim que o mid volta do envio (antes de qualquer novo await), entao
// nenhum evento de webhook consegue ser processado no meio disso (loop de eventos
// single-threaded do Node) - so funciona pq a API roda numa unica instancia
// (instance_count: 1 no app spec), o que ja e o caso hoje.
const midsRecentesDoAgente = new Set<string>();

export function marcarComoEnviadoPeloAgente(mid: string): void {
  midsRecentesDoAgente.add(mid);
  setTimeout(() => midsRecentesDoAgente.delete(mid), 30_000).unref();
}

export function foiEnviadoPeloAgente(mid: string): boolean {
  return midsRecentesDoAgente.has(mid);
}

export interface EnviarRespostaDoAgenteParams {
  // Nulo quando a conversa ainda nao teve a unidade resolvida (doc 17, parte 4) - a
  // primeira mensagem do agente ("qual unidade voce quer?") sai pela conexao
  // compartilhada da empresa, por isso empresaId e obrigatorio nesse caso.
  unidadeId: string | null;
  empresaId?: string;
  igSenderId: string;
  conversaId: string;
  texto: string;
}

// Ponto unico de saida pro Instagram, usado tanto apos um turno do agente quanto apos
// uma reserva criada pela pagina publica (/reservar/:token). Decifra o token da
// unidade, envia, e registra a mensagem no historico (papel "assistant") pra manter a
// conversa consistente independente de quem/o que gerou a resposta.
export async function enviarRespostaDoAgente(db: Database, params: EnviarRespostaDoAgenteParams): Promise<void> {
  if (!env.TOKEN_ENCRYPTION_KEY) {
    console.error("[instagram] TOKEN_ENCRYPTION_KEY nao configurada - mensagem gerada mas nao enviada");
    return;
  }

  const conexao = params.unidadeId
    ? await buscarConexaoAtivaDaUnidade(db, params.unidadeId)
    : params.empresaId
      ? await buscarConexaoCompartilhadaDaEmpresa(db, params.empresaId)
      : null;
  if (!conexao) {
    console.error(`[instagram] nenhuma conexao ativa para ${params.unidadeId ? `a unidade ${params.unidadeId}` : `a empresa ${params.empresaId}`}`);
    return;
  }

  const accessToken = decrypt(conexao.accessTokenEncrypted, env.TOKEN_ENCRYPTION_KEY);

  let igMessageId: string;
  try {
    igMessageId = await enviarMensagemInstagram(accessToken, params.igSenderId, params.texto);
  } catch (err) {
    if (err instanceof InstagramAuthError) {
      // Marca a conexao como expirada pro painel mostrar "Reconectar" - nao impede o
      // erro de continuar subindo pro chamador (mesmo comportamento de antes, so com
      // esse efeito colateral a mais).
      await db.update(instagramConnections).set({ status: "expirada" }).where(eq(instagramConnections.id, conexao.id));
    }
    throw err;
  }

  // Precisa ser sincrono, sem nenhum await entre o retorno de enviarMensagemInstagram
  // e esta linha - e o que garante que nenhum webhook de echo desse mesmo envio seja
  // processado antes do guard estar armado (ver comentario acima).
  if (igMessageId) {
    marcarComoEnviadoPeloAgente(igMessageId);
  }

  await db.insert(mensagens).values({
    conversaId: params.conversaId,
    papel: "assistant",
    conteudo: params.texto,
    igMessageId: igMessageId || null,
  });
}
