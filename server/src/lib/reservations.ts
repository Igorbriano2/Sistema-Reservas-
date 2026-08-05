import { and, desc, eq, inArray, ne, type SQL } from "drizzle-orm";
import type { Database, Queryable } from "../db/client.js";
import { mesas, regrasHorario, reservas, saloes, type Reserva } from "../db/schema/index.js";
import { diaDaSemana, intervalosSeSobrepoem, paraMinutos, somarMinutos } from "./time.js";
import { ConflitoDeHorarioError, RecursoNaoEncontradoError, RequisicaoInvalidaError } from "./errors.js";

const STATUS_ATIVOS = ["pendente", "confirmada"] as const;
// Codigo do Postgres para violacao de EXCLUDE constraint (reservas_sem_sobreposicao).
const PG_EXCLUSION_VIOLATION = "23P01";

function ehViolacaoDeExclusao(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === PG_EXCLUSION_VIOLATION;
}

interface JanelaDaReserva {
  horaFim: string;
  bufferMin: number;
}

async function resolverJanela(
  tx: Queryable,
  unidadeId: string,
  data: string,
  horaInicio: string,
  horaFimInformada?: string,
): Promise<JanelaDaReserva> {
  if (horaFimInformada) {
    return { horaFim: horaFimInformada, bufferMin: 0 };
  }
  const [regra] = await tx
    .select()
    .from(regrasHorario)
    .where(and(eq(regrasHorario.unidadeId, unidadeId), eq(regrasHorario.diaSemana, diaDaSemana(data))))
    .limit(1);

  const duracaoPadraoMin = regra?.duracaoPadraoMin ?? 90;
  return { horaFim: somarMinutos(horaInicio, duracaoPadraoMin), bufferMin: regra?.bufferMin ?? 0 };
}

async function validarSemConflito(
  tx: Queryable,
  params: { mesaId: string; data: string; horaInicio: string; horaFim: string; bufferMin: number; ignorarReservaId?: string },
): Promise<void> {
  const condicoes = [
    eq(reservas.mesaId, params.mesaId),
    eq(reservas.data, params.data),
    inArray(reservas.status, [...STATUS_ATIVOS]),
  ];
  if (params.ignorarReservaId) {
    condicoes.push(ne(reservas.id, params.ignorarReservaId));
  }

  const existentes = await tx
    .select({ horaInicio: reservas.horaInicio, horaFim: reservas.horaFim })
    .from(reservas)
    .where(and(...condicoes));

  const inicioMin = paraMinutos(params.horaInicio) - params.bufferMin;
  const fimMin = paraMinutos(params.horaFim) + params.bufferMin;
  const conflita = existentes.some((r) =>
    intervalosSeSobrepoem(inicioMin, fimMin, paraMinutos(r.horaInicio), paraMinutos(r.horaFim)),
  );
  if (conflita) {
    throw new ConflitoDeHorarioError();
  }
}

export interface CriarReservaParams {
  unidadeId: string;
  mesaId: string;
  data: string;
  horaInicio: string;
  horaFim?: string;
  numPessoas: number;
  clienteNome: string;
  clienteTelefone?: string;
  observacoes?: string;
  igSenderId?: string;
  canalOrigem: "instagram" | "manual";
}

export async function criarReserva(db: Database, params: CriarReservaParams): Promise<Reserva> {
  return db.transaction(async (tx) => {
    // Lock na linha da mesa: serializa criacoes concorrentes na MESMA mesa, evitando
    // que duas requisicoes simultaneas leiam "sem conflito" antes de qualquer uma inserir.
    const [mesaTrancada] = await tx
      .select({
        id: mesas.id,
        salaoId: mesas.salaoId,
        capacidadeMin: mesas.capacidadeMin,
        capacidadeMax: mesas.capacidadeMax,
      })
      .from(mesas)
      .where(eq(mesas.id, params.mesaId))
      .for("update");

    if (!mesaTrancada) {
      throw new RecursoNaoEncontradoError("Mesa nao encontrada");
    }

    const [salao] = await tx
      .select({ unidadeId: saloes.unidadeId })
      .from(saloes)
      .where(eq(saloes.id, mesaTrancada.salaoId))
      .limit(1);

    if (!salao || salao.unidadeId !== params.unidadeId) {
      throw new RecursoNaoEncontradoError("Mesa nao encontrada nesta unidade");
    }

    if (params.numPessoas < mesaTrancada.capacidadeMin || params.numPessoas > mesaTrancada.capacidadeMax) {
      throw new RequisicaoInvalidaError(
        `Numero de pessoas fora da capacidade da mesa (${mesaTrancada.capacidadeMin}-${mesaTrancada.capacidadeMax})`,
      );
    }

    const { horaFim, bufferMin } = await resolverJanela(tx, params.unidadeId, params.data, params.horaInicio, params.horaFim);

    await validarSemConflito(tx, {
      mesaId: params.mesaId,
      data: params.data,
      horaInicio: params.horaInicio,
      horaFim,
      bufferMin,
    });

    try {
      const [reserva] = await tx
        .insert(reservas)
        .values({
          unidadeId: params.unidadeId,
          mesaId: params.mesaId,
          igSenderId: params.igSenderId,
          clienteNome: params.clienteNome,
          clienteTelefone: params.clienteTelefone,
          numPessoas: params.numPessoas,
          data: params.data,
          horaInicio: params.horaInicio,
          horaFim,
          observacoes: params.observacoes,
          canalOrigem: params.canalOrigem,
        })
        .returning();
      return reserva;
    } catch (err) {
      // Rede de seguranca: mesmo que a checagem acima passe, a constraint EXCLUDE
      // do banco (reservas_sem_sobreposicao) rejeita qualquer overlap remanescente.
      if (ehViolacaoDeExclusao(err)) {
        throw new ConflitoDeHorarioError();
      }
      throw err;
    }
  });
}

export interface AtualizarReservaParams {
  clienteNome?: string;
  clienteTelefone?: string;
  numPessoas?: number;
  mesaId?: string;
  data?: string;
  horaInicio?: string;
  horaFim?: string;
  status?: (typeof reservas.$inferSelect)["status"];
  observacoes?: string;
}

// condicoesDeIdentidade SEMPRE inclui id + unidade_id; quando chamada em nome de um
// cliente do Instagram, tambem inclui ig_sender_id, transformando a checagem de posse
// em parte da propria query (nunca um "buscar depois comparar" separado e falivel).
async function atualizarReservaComCondicoes(
  db: Database,
  unidadeId: string,
  condicoesDeIdentidade: SQL[],
  patch: AtualizarReservaParams,
): Promise<Reserva> {
  return db.transaction(async (tx) => {
    const [atual] = await tx
      .select()
      .from(reservas)
      .where(and(...condicoesDeIdentidade))
      .for("update");

    if (!atual) {
      throw new RecursoNaoEncontradoError("Reserva nao encontrada");
    }

    const mesaId = patch.mesaId ?? atual.mesaId;
    const data = patch.data ?? atual.data;
    const horaInicio = patch.horaInicio ?? atual.horaInicio;
    const mudouHorarioOuMesa = mesaId !== atual.mesaId || data !== atual.data || horaInicio !== atual.horaInicio || !!patch.horaFim;

    let horaFim = patch.horaFim ?? atual.horaFim;

    if (mudouHorarioOuMesa) {
      const [mesa] = await tx
        .select({ salaoId: mesas.salaoId, capacidadeMin: mesas.capacidadeMin, capacidadeMax: mesas.capacidadeMax })
        .from(mesas)
        .where(eq(mesas.id, mesaId))
        .for("update");
      if (!mesa) {
        throw new RecursoNaoEncontradoError("Mesa nao encontrada");
      }
      const [salao] = await tx.select({ unidadeId: saloes.unidadeId }).from(saloes).where(eq(saloes.id, mesa.salaoId)).limit(1);
      if (!salao || salao.unidadeId !== unidadeId) {
        throw new RecursoNaoEncontradoError("Mesa nao encontrada nesta unidade");
      }

      const numPessoas = patch.numPessoas ?? atual.numPessoas;
      if (numPessoas < mesa.capacidadeMin || numPessoas > mesa.capacidadeMax) {
        throw new RequisicaoInvalidaError(
          `Numero de pessoas fora da capacidade da mesa (${mesa.capacidadeMin}-${mesa.capacidadeMax})`,
        );
      }

      if (!patch.horaFim) {
        const janela = await resolverJanela(tx, unidadeId, data, horaInicio);
        horaFim = janela.horaFim;
      }

      const { bufferMin } = await resolverJanela(tx, unidadeId, data, horaInicio);
      await validarSemConflito(tx, {
        mesaId,
        data,
        horaInicio,
        horaFim,
        bufferMin,
        ignorarReservaId: atual.id,
      });
    }

    try {
      const [atualizada] = await tx
        .update(reservas)
        .set({
          clienteNome: patch.clienteNome,
          clienteTelefone: patch.clienteTelefone,
          numPessoas: patch.numPessoas,
          mesaId,
          data,
          horaInicio,
          horaFim,
          status: patch.status,
          observacoes: patch.observacoes,
        })
        .where(eq(reservas.id, atual.id))
        .returning();
      return atualizada;
    } catch (err) {
      if (ehViolacaoDeExclusao(err)) {
        throw new ConflitoDeHorarioError();
      }
      throw err;
    }
  });
}

export async function atualizarReservaDaUnidade(
  db: Database,
  unidadeId: string,
  reservaId: string,
  patch: AtualizarReservaParams,
): Promise<Reserva> {
  return atualizarReservaComCondicoes(
    db,
    unidadeId,
    [eq(reservas.id, reservaId), eq(reservas.unidadeId, unidadeId)],
    patch,
  );
}

// Usada pelas tools do agente: a posse (ig_sender_id) e resolvida sempre a partir de
// conversas.ig_sender_id no backend, nunca aceita como parametro vindo do modelo, e
// entra na propria condicao de busca da reserva (nao um cheque "depois de buscar").
export async function atualizarReservaDoCliente(
  db: Database,
  params: { unidadeId: string; igSenderId: string; reservaId: string },
  patch: AtualizarReservaParams,
): Promise<Reserva> {
  return atualizarReservaComCondicoes(
    db,
    params.unidadeId,
    [
      eq(reservas.id, params.reservaId),
      eq(reservas.unidadeId, params.unidadeId),
      eq(reservas.igSenderId, params.igSenderId),
    ],
    patch,
  );
}

async function cancelarReservaComCondicoes(db: Database, condicoesDeIdentidade: SQL[]): Promise<Reserva> {
  const [reserva] = await db
    .update(reservas)
    .set({ status: "cancelada" })
    .where(and(...condicoesDeIdentidade))
    .returning();

  if (!reserva) {
    throw new RecursoNaoEncontradoError("Reserva nao encontrada");
  }
  return reserva;
}

export async function cancelarReservaDaUnidade(db: Database, unidadeId: string, reservaId: string): Promise<Reserva> {
  return cancelarReservaComCondicoes(db, [eq(reservas.id, reservaId), eq(reservas.unidadeId, unidadeId)]);
}

export async function cancelarReservaDoCliente(
  db: Database,
  params: { unidadeId: string; igSenderId: string; reservaId: string },
): Promise<Reserva> {
  return cancelarReservaComCondicoes(db, [
    eq(reservas.id, params.reservaId),
    eq(reservas.unidadeId, params.unidadeId),
    eq(reservas.igSenderId, params.igSenderId),
  ]);
}

export async function buscarReservasDoCliente(
  db: Database,
  params: { unidadeId: string; igSenderId: string; limite?: number },
): Promise<Reserva[]> {
  return db
    .select()
    .from(reservas)
    .where(and(eq(reservas.unidadeId, params.unidadeId), eq(reservas.igSenderId, params.igSenderId)))
    .orderBy(desc(reservas.data), desc(reservas.horaInicio))
    .limit(params.limite ?? 20);
}
