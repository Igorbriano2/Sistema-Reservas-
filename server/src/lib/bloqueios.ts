import { and, eq, gte, inArray, lte, or } from "drizzle-orm";
import type { Database, Queryable } from "../db/client.js";
import { bloqueios, mesas, saloes, type Bloqueio } from "../db/schema/index.js";
import { RecursoNaoEncontradoError, RequisicaoInvalidaError } from "./errors.js";

export interface CriarBloqueioParams {
  unidadeId: string;
  mesaId?: string;
  salaoId?: string;
  dataInicio: string;
  dataFim: string;
  motivo: string;
}

export async function criarBloqueio(db: Database, params: CriarBloqueioParams): Promise<Bloqueio> {
  if (!!params.mesaId === !!params.salaoId) {
    throw new RequisicaoInvalidaError("Informe exatamente um dos dois: mesaId ou salaoId");
  }
  if (params.dataFim < params.dataInicio) {
    throw new RequisicaoInvalidaError("dataFim deve ser maior ou igual a dataInicio");
  }

  if (params.mesaId) {
    const [mesa] = await db
      .select({ id: mesas.id })
      .from(mesas)
      .innerJoin(saloes, eq(mesas.salaoId, saloes.id))
      .where(and(eq(mesas.id, params.mesaId), eq(saloes.unidadeId, params.unidadeId)))
      .limit(1);
    if (!mesa) throw new RecursoNaoEncontradoError("Mesa nao encontrada nesta unidade");
  } else {
    const [salao] = await db
      .select({ id: saloes.id })
      .from(saloes)
      .where(and(eq(saloes.id, params.salaoId!), eq(saloes.unidadeId, params.unidadeId)))
      .limit(1);
    if (!salao) throw new RecursoNaoEncontradoError("Salao nao encontrado nesta unidade");
  }

  const [bloqueio] = await db
    .insert(bloqueios)
    .values({
      unidadeId: params.unidadeId,
      mesaId: params.mesaId,
      salaoId: params.salaoId,
      dataInicio: params.dataInicio,
      dataFim: params.dataFim,
      motivo: params.motivo,
    })
    .returning();
  return bloqueio;
}

// "Ativos" = ainda nao terminaram (dataFim >= hoje). Bloqueios inteiramente no
// passado nao aparecem na listagem do admin.
export async function listarBloqueiosAtivos(db: Database, unidadeId: string): Promise<Bloqueio[]> {
  const hoje = new Date().toISOString().slice(0, 10);
  return db
    .select()
    .from(bloqueios)
    .where(and(eq(bloqueios.unidadeId, unidadeId), gte(bloqueios.dataFim, hoje)))
    .orderBy(bloqueios.dataInicio);
}

export async function removerBloqueio(db: Database, unidadeId: string, bloqueioId: string): Promise<void> {
  const apagados = await db
    .delete(bloqueios)
    .where(and(eq(bloqueios.id, bloqueioId), eq(bloqueios.unidadeId, unidadeId)))
    .returning({ id: bloqueios.id });
  if (apagados.length === 0) {
    throw new RecursoNaoEncontradoError("Bloqueio nao encontrado");
  }
}

// Mesma ideia de bloqueioAtivoPara, mas para reservas do modo "simples" (sem mesa):
// so existe bloqueio direto no salao inteiro (nao ha mesa pra checar).
export async function bloqueioDeSalaoAtivoPara(
  db: Queryable,
  params: { unidadeId: string; salaoId: string; data: string },
): Promise<Bloqueio | null> {
  const [bloqueio] = await db
    .select()
    .from(bloqueios)
    .where(
      and(
        eq(bloqueios.unidadeId, params.unidadeId),
        lte(bloqueios.dataInicio, params.data),
        gte(bloqueios.dataFim, params.data),
        eq(bloqueios.salaoId, params.salaoId),
      ),
    )
    .limit(1);
  return bloqueio ?? null;
}

// Usada na criacao/edicao de UMA reserva (mesa ja resolvida): devolve o bloqueio que
// a impede (direto na mesa, ou no salao inteiro) nessa data, ou null se estiver livre.
export async function bloqueioAtivoPara(
  db: Queryable,
  params: { unidadeId: string; mesaId: string; salaoId: string; data: string },
): Promise<Bloqueio | null> {
  const [bloqueio] = await db
    .select()
    .from(bloqueios)
    .where(
      and(
        eq(bloqueios.unidadeId, params.unidadeId),
        lte(bloqueios.dataInicio, params.data),
        gte(bloqueios.dataFim, params.data),
        or(eq(bloqueios.mesaId, params.mesaId), eq(bloqueios.salaoId, params.salaoId)),
      ),
    )
    .limit(1);
  return bloqueio ?? null;
}

// Mesma ideia de mesasBloqueadasEm, mas para varios saloes candidatos do modo
// "simples" de uma vez: devolve o conjunto de salaoId com bloqueio ativo na data.
export async function saloesBloqueadosEm(
  db: Queryable,
  params: { unidadeId: string; data: string; salaoIds: string[] },
): Promise<Set<string>> {
  if (params.salaoIds.length === 0) return new Set();
  const linhas = await db
    .select({ salaoId: bloqueios.salaoId })
    .from(bloqueios)
    .where(
      and(
        eq(bloqueios.unidadeId, params.unidadeId),
        lte(bloqueios.dataInicio, params.data),
        gte(bloqueios.dataFim, params.data),
        inArray(bloqueios.salaoId, params.salaoIds),
      ),
    );
  return new Set(linhas.map((l) => l.salaoId).filter((v): v is string => !!v));
}

// Usada pela checagem de disponibilidade (varias mesas candidatas de uma vez): devolve
// o conjunto de mesaId bloqueados na data, direto ou por bloqueio do salao inteiro.
export async function mesasBloqueadasEm(
  db: Queryable,
  params: { unidadeId: string; data: string; mesaIds: string[]; salaoIdPorMesa: Map<string, string> },
): Promise<Set<string>> {
  if (params.mesaIds.length === 0) return new Set();
  const salaoIds = [
    ...new Set(params.mesaIds.map((id) => params.salaoIdPorMesa.get(id)).filter((v): v is string => !!v)),
  ];

  const linhas = await db
    .select({ mesaId: bloqueios.mesaId, salaoId: bloqueios.salaoId })
    .from(bloqueios)
    .where(
      and(
        eq(bloqueios.unidadeId, params.unidadeId),
        lte(bloqueios.dataInicio, params.data),
        gte(bloqueios.dataFim, params.data),
        or(
          inArray(bloqueios.mesaId, params.mesaIds),
          salaoIds.length > 0 ? inArray(bloqueios.salaoId, salaoIds) : undefined,
        ),
      ),
    );

  const bloqueadas = new Set<string>();
  for (const linha of linhas) {
    if (linha.mesaId) {
      bloqueadas.add(linha.mesaId);
    } else if (linha.salaoId) {
      for (const [mesaId, salaoId] of params.salaoIdPorMesa) {
        if (salaoId === linha.salaoId) bloqueadas.add(mesaId);
      }
    }
  }
  return bloqueadas;
}
