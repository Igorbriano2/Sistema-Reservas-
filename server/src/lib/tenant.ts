import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { unidades } from "../db/schema/index.js";

// usuarios pertencem a uma empresa (nao a uma unidade especifica no MVP - ver
// tabela usuarios no schema). Os endpoints administrativos operam sobre uma
// unidade_id vinda da rota; este helper garante que essa unidade realmente
// pertence a empresa do usuario autenticado antes de qualquer leitura/escrita,
// para nunca vazar dados entre empresas.
export async function unidadePertenceAEmpresa(
  db: Database,
  unidadeId: string,
  empresaId: string,
): Promise<boolean> {
  const [unidade] = await db
    .select({ id: unidades.id })
    .from(unidades)
    .where(and(eq(unidades.id, unidadeId), eq(unidades.empresaId, empresaId)))
    .limit(1);

  return !!unidade;
}
