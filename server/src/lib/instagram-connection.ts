import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { instagramConnections, unidades, type InstagramConnection } from "../db/schema/index.js";

// Conexao "da empresa toda" (unidade_id nulo) - usada tanto como fallback de uma
// unidade sem conexao propria (ver buscarConexaoAtivaDaUnidade) quanto pra enviar
// mensagem numa conversa cuja unidade ainda nao foi resolvida (doc 17, parte 4).
export async function buscarConexaoCompartilhadaDaEmpresa(db: Database, empresaId: string): Promise<InstagramConnection | null> {
  const [daEmpresa] = await db
    .select()
    .from(instagramConnections)
    .where(and(eq(instagramConnections.empresaId, empresaId), isNull(instagramConnections.unidadeId), eq(instagramConnections.status, "ativo")))
    .limit(1);
  return daEmpresa ?? null;
}

// Direcao inversa de resolverUnidadeDaConexao (usada no webhook): aqui ja sabemos a
// unidade e precisamos achar a conexao do Instagram pra ENVIAR uma mensagem pra ela
// (confirmacao de reserva feita pela pagina publica, por exemplo). Mesma regra: se a
// unidade nao tem conexao propria, cai pra uma conexao "da empresa toda" (unidade_id nulo).
export async function buscarConexaoAtivaDaUnidade(db: Database, unidadeId: string): Promise<InstagramConnection | null> {
  const [direta] = await db
    .select()
    .from(instagramConnections)
    .where(and(eq(instagramConnections.unidadeId, unidadeId), eq(instagramConnections.status, "ativo")))
    .limit(1);
  if (direta) return direta;

  const [unidade] = await db.select({ empresaId: unidades.empresaId }).from(unidades).where(eq(unidades.id, unidadeId)).limit(1);
  if (!unidade) return null;

  return buscarConexaoCompartilhadaDaEmpresa(db, unidade.empresaId);
}
