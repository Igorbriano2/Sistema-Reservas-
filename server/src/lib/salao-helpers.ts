import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { saloes } from "../db/schema/index.js";
import { RequisicaoInvalidaError } from "./errors.js";

// Compartilhado entre mesas.routes.ts e salao-elementos.routes.ts - ambos os recursos
// so referenciam salaoId no corpo, entao precisam confirmar que o salao pertence a
// unidade autenticada antes de criar/mover algo pra la.
export async function validarSalaoDaUnidade(salaoId: string, unidadeId: string): Promise<void> {
  const [salao] = await db
    .select({ id: saloes.id })
    .from(saloes)
    .where(and(eq(saloes.id, salaoId), eq(saloes.unidadeId, unidadeId)))
    .limit(1);
  if (!salao) throw new RequisicaoInvalidaError("Salao nao encontrado nesta unidade");
}
