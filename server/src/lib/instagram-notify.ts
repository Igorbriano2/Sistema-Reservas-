import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { instagramConnections, mensagens } from "../db/schema/index.js";
import { env } from "../config/env.js";
import { decrypt } from "./crypto.js";
import { enviarMensagemInstagram, InstagramAuthError } from "./instagram-api.js";
import { buscarConexaoAtivaDaUnidade, buscarConexaoCompartilhadaDaEmpresa } from "./instagram-connection.js";

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

  await db.insert(mensagens).values({
    conversaId: params.conversaId,
    papel: "assistant",
    conteudo: params.texto,
    igMessageId: igMessageId || null,
  });
}
