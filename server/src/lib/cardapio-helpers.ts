import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { cardapioCategorias } from "../db/schema/index.js";
import { RequisicaoInvalidaError } from "./errors.js";

// Compartilhado com cardapio-itens.routes.ts - todo item so referencia categoriaId no
// corpo, entao precisa confirmar que a categoria pertence a unidade autenticada antes
// de criar/mover algo pra la (mesmo padrao de validarSalaoDaUnidade).
export async function validarCategoriaDaUnidade(categoriaId: string, unidadeId: string): Promise<void> {
  const [categoria] = await db
    .select({ id: cardapioCategorias.id })
    .from(cardapioCategorias)
    .where(and(eq(cardapioCategorias.id, categoriaId), eq(cardapioCategorias.unidadeId, unidadeId)))
    .limit(1);
  if (!categoria) throw new RequisicaoInvalidaError("Categoria nao encontrada nesta unidade");
}
