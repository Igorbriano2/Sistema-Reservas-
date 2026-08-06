import type { Database } from "../db/client.js";
import { mensagens } from "../db/schema/index.js";
import { env } from "../config/env.js";
import { decrypt } from "./crypto.js";
import { enviarMensagemInstagram } from "./instagram-api.js";
import { buscarConexaoAtivaDaUnidade } from "./instagram-connection.js";

export interface EnviarRespostaDoAgenteParams {
  unidadeId: string;
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

  const conexao = await buscarConexaoAtivaDaUnidade(db, params.unidadeId);
  if (!conexao) {
    console.error(`[instagram] nenhuma conexao ativa para a unidade ${params.unidadeId}`);
    return;
  }

  const accessToken = decrypt(conexao.accessTokenEncrypted, env.TOKEN_ENCRYPTION_KEY);
  const igMessageId = await enviarMensagemInstagram(accessToken, params.igSenderId, params.texto);

  await db.insert(mensagens).values({
    conversaId: params.conversaId,
    papel: "assistant",
    conteudo: params.texto,
    igMessageId: igMessageId || null,
  });
}
