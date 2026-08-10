import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { conversas, type Conversa } from "../db/schema/index.js";
import { env } from "../config/env.js";
import { decrypt } from "./crypto.js";
import { obterPerfilInstagram } from "./instagram-api.js";
import { buscarConexaoAtivaDaUnidade, buscarConexaoCompartilhadaDaEmpresa } from "./instagram-connection.js";

type ConversaParaPerfil = Pick<Conversa, "id" | "empresaId" | "unidadeId" | "igSenderId">;

async function buscarConexaoDaConversa(db: Database, conversa: ConversaParaPerfil) {
  return conversa.unidadeId
    ? buscarConexaoAtivaDaUnidade(db, conversa.unidadeId)
    : buscarConexaoCompartilhadaDaEmpresa(db, conversa.empresaId);
}

async function preencherPerfilCliente(db: Database, conversa: ConversaParaPerfil): Promise<void> {
  if (!env.TOKEN_ENCRYPTION_KEY) return;
  const conexao = await buscarConexaoDaConversa(db, conversa);
  if (!conexao) return;

  const accessToken = decrypt(conexao.accessTokenEncrypted, env.TOKEN_ENCRYPTION_KEY);
  const perfil = await obterPerfilInstagram(accessToken, conversa.igSenderId);
  if (!perfil.nome && !perfil.fotoUrl) return;

  await db.update(conversas).set({ nomeCliente: perfil.nome, fotoClienteUrl: perfil.fotoUrl }).where(eq(conversas.id, conversa.id));
}

// Doc 33 - dispara em segundo plano, sem nunca bloquear quem chamou (o webhook
// precisa responder 200 rapido pra Meta, e a listagem do painel nao deveria esperar
// uma chamada de API externa). So loga se falhar - o painel cai de volta pro
// ig_sender_id cru, sem quebrar nada.
export function preencherPerfilClienteEmSegundoPlano(db: Database, conversa: ConversaParaPerfil): void {
  preencherPerfilCliente(db, conversa).catch((err) =>
    console.error(`[instagram] falha ao buscar perfil do cliente ${conversa.igSenderId}:`, err),
  );
}

// Backfill pra conversas que nasceram antes desse campo existir (ou cuja busca
// anterior falhou) - roda em sequencia (nao em paralelo) pra nao estourar rate limit
// da Graph API quando o painel lista muitas conversas de uma vez.
export async function preencherPerfisFaltantes(db: Database, lista: Conversa[]): Promise<void> {
  for (const conversa of lista) {
    if (conversa.nomeCliente || conversa.fotoClienteUrl) continue;
    await preencherPerfilCliente(db, conversa).catch((err) =>
      console.error(`[instagram] falha ao buscar perfil do cliente ${conversa.igSenderId}:`, err),
    );
  }
}
