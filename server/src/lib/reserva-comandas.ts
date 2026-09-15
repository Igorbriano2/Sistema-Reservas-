import { and, eq, inArray } from "drizzle-orm";
import type { Database, Queryable } from "../db/client.js";
import { reservaComandas, reservas, type ReservaComanda } from "../db/schema/index.js";
import { RecursoNaoEncontradoError } from "./errors.js";

// Usado pela listagem de reservas do painel (GET .../reservations) pra anexar as
// comandas de cada reserva numa unica query, em vez de uma query por reserva.
export async function comandasPorReservaId(db: Queryable, reservaIds: string[]): Promise<Map<string, ReservaComanda[]>> {
  const mapa = new Map<string, ReservaComanda[]>();
  if (reservaIds.length === 0) return mapa;
  const linhas = await db.select().from(reservaComandas).where(inArray(reservaComandas.reservaId, reservaIds));
  for (const linha of linhas) {
    const lista = mapa.get(linha.reservaId) ?? [];
    lista.push(linha);
    mapa.set(linha.reservaId, lista);
  }
  return mapa;
}

// Confirma que a reserva existe E pertence a unidade do usuario logado antes de
// mexer nas comandas - mesmo racional de tenant-isolation que atualizarReservaDaUnidade
// ja aplica, senao um atendente de uma unidade podia adicionar/remover comanda de
// reserva de outra empresa so adivinhando o id.
async function reservaPertenceAUnidade(db: Queryable, unidadeId: string, reservaId: string): Promise<boolean> {
  const [reserva] = await db
    .select({ id: reservas.id })
    .from(reservas)
    .where(and(eq(reservas.id, reservaId), eq(reservas.unidadeId, unidadeId)))
    .limit(1);
  return !!reserva;
}

export async function adicionarComandaNaReserva(
  db: Database,
  params: { unidadeId: string; reservaId: string; numero: string },
): Promise<ReservaComanda> {
  if (!(await reservaPertenceAUnidade(db, params.unidadeId, params.reservaId))) {
    throw new RecursoNaoEncontradoError("Reserva nao encontrada");
  }
  const [comanda] = await db
    .insert(reservaComandas)
    .values({ reservaId: params.reservaId, numero: params.numero })
    .returning();
  return comanda;
}

export async function removerComandaDaReserva(
  db: Database,
  params: { unidadeId: string; reservaId: string; comandaId: string },
): Promise<void> {
  if (!(await reservaPertenceAUnidade(db, params.unidadeId, params.reservaId))) {
    throw new RecursoNaoEncontradoError("Reserva nao encontrada");
  }
  const removidas = await db
    .delete(reservaComandas)
    .where(and(eq(reservaComandas.id, params.comandaId), eq(reservaComandas.reservaId, params.reservaId)))
    .returning({ id: reservaComandas.id });
  if (removidas.length === 0) {
    throw new RecursoNaoEncontradoError("Comanda nao encontrada");
  }
}
