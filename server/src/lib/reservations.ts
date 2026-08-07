import { and, desc, eq, inArray, ne, type SQL } from "drizzle-orm";
import type { Database, Queryable } from "../db/client.js";
import { mesas, regrasHorario, reservas, saloes, type Reserva } from "../db/schema/index.js";
import { diaDaSemana, intervalosSeSobrepoem, paraMinutos, somarMinutos } from "./time.js";
import { ConflitoDeHorarioError, RecursoNaoEncontradoError, RequisicaoInvalidaError } from "./errors.js";
import { codigoDoErroPostgres } from "./pg-error.js";
import { verificarDisponibilidade } from "./availability.js";
import { bloqueioAtivoPara, bloqueioDeSalaoAtivoPara } from "./bloqueios.js";

// Reservas nesses status contam para a capacidade agregada de um salao em modo
// "simples" (ver criarReservaSimples/atualizarReservaComCondicoes) - mesmo conjunto
// usado em verificarDisponibilidade para o mesmo modo.
const STATUS_QUE_OCUPA_SALAO_SIMPLES = ["confirmada", "concluida"] as const;

const STATUS_ATIVOS = ["pendente", "confirmada"] as const;
// So uma reserva ainda ativa (nao cancelada/ja concluida/ja no_show) pode ser marcada
// como "sentada" (concluida) ou "nao compareceu" - evita, por exemplo, marcar como
// sentada uma reserva ja cancelada.
const STATUS_LABEL: Record<string, string> = {
  pendente: "pendente",
  confirmada: "confirmada",
  cancelada: "cancelada",
  concluida: "sentada",
  no_show: "nao compareceu",
};
// Codigo do Postgres para violacao de EXCLUDE constraint (reservas_sem_sobreposicao).
const PG_EXCLUSION_VIOLATION = "23P01";

function ehViolacaoDeExclusao(err: unknown): boolean {
  return codigoDoErroPostgres(err) === PG_EXCLUSION_VIOLATION;
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
  // Exatamente um dos dois: mesaId (salao em modo "mapa") ou salaoId (modo "simples").
  mesaId?: string;
  salaoId?: string;
  data: string;
  horaInicio: string;
  horaFim?: string;
  numPessoas: number;
  clienteNome: string;
  clienteTelefone?: string;
  observacoes?: string;
  igSenderId?: string;
  canalOrigem: "instagram" | "manual" | "widget";
}

export async function criarReserva(db: Database, params: CriarReservaParams): Promise<Reserva> {
  if (!!params.mesaId === !!params.salaoId) {
    throw new RequisicaoInvalidaError("Informe exatamente um dos dois: mesaId ou salaoId");
  }
  if (params.salaoId) {
    return criarReservaSimples(db, { ...params, salaoId: params.salaoId });
  }
  return criarReservaComMesa(db, { ...params, mesaId: params.mesaId! });
}

async function criarReservaComMesa(
  db: Database,
  params: CriarReservaParams & { mesaId: string },
): Promise<Reserva> {
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

    const bloqueio = await bloqueioAtivoPara(tx, {
      unidadeId: params.unidadeId,
      mesaId: params.mesaId,
      salaoId: mesaTrancada.salaoId,
      data: params.data,
    });
    if (bloqueio) {
      throw new ConflitoDeHorarioError(`Mesa bloqueada nesta data (motivo: ${bloqueio.motivo})`);
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

async function criarReservaSimples(
  db: Database,
  params: CriarReservaParams & { salaoId: string },
): Promise<Reserva> {
  return db.transaction(async (tx) => {
    // Lock na linha do salao: serializa criacoes concorrentes no MESMO salao (modo
    // simples), mesmo racional do lock de mesa em criarReservaComMesa - nao ha
    // constraint EXCLUDE do banco pra capacidade agregada, entao esse lock e a
    // unica linha de defesa contra corrida (duas requisicoes somando capacidade
    // "livre" ao mesmo tempo e ambas passando).
    const [salaoTrancado] = await tx
      .select({
        id: saloes.id,
        unidadeId: saloes.unidadeId,
        modoConfiguracao: saloes.modoConfiguracao,
        capacidadeTotal: saloes.capacidadeTotal,
      })
      .from(saloes)
      .where(eq(saloes.id, params.salaoId))
      .for("update");

    if (!salaoTrancado) {
      throw new RecursoNaoEncontradoError("Salao nao encontrado");
    }
    if (salaoTrancado.unidadeId !== params.unidadeId) {
      throw new RecursoNaoEncontradoError("Salao nao encontrado nesta unidade");
    }
    if (salaoTrancado.modoConfiguracao !== "simples") {
      throw new RequisicaoInvalidaError("Este salao nao esta no modo simples (sem selecao de mesa)");
    }
    if (!salaoTrancado.capacidadeTotal || salaoTrancado.capacidadeTotal <= 0) {
      throw new RequisicaoInvalidaError("Capacidade total do salao ainda nao foi configurada");
    }
    if (params.numPessoas > salaoTrancado.capacidadeTotal) {
      throw new RequisicaoInvalidaError(
        `Numero de pessoas maior que a capacidade total do salao (${salaoTrancado.capacidadeTotal})`,
      );
    }

    const bloqueio = await bloqueioDeSalaoAtivoPara(tx, {
      unidadeId: params.unidadeId,
      salaoId: params.salaoId,
      data: params.data,
    });
    if (bloqueio) {
      throw new ConflitoDeHorarioError(`Salao bloqueado nesta data (motivo: ${bloqueio.motivo})`);
    }

    const { horaFim, bufferMin } = await resolverJanela(tx, params.unidadeId, params.data, params.horaInicio, params.horaFim);

    await validarCapacidadeSalaoSimples(tx, {
      salaoId: params.salaoId,
      capacidadeTotal: salaoTrancado.capacidadeTotal,
      data: params.data,
      horaInicio: params.horaInicio,
      horaFim,
      bufferMin,
      numPessoasNova: params.numPessoas,
    });

    const [reserva] = await tx
      .insert(reservas)
      .values({
        unidadeId: params.unidadeId,
        salaoId: params.salaoId,
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
  });
}

// Soma num_pessoas de todas as reservas ativas do salao (modo simples) que se
// sobrepoem ao horario informado e rejeita se estourar a capacidade total.
// ignorarReservaId exclui a propria reserva ao reavaliar uma edicao.
async function validarCapacidadeSalaoSimples(
  tx: Queryable,
  params: {
    salaoId: string;
    capacidadeTotal: number;
    data: string;
    horaInicio: string;
    horaFim: string;
    bufferMin: number;
    numPessoasNova: number;
    ignorarReservaId?: string;
  },
): Promise<void> {
  const condicoes = [
    eq(reservas.salaoId, params.salaoId),
    eq(reservas.data, params.data),
    inArray(reservas.status, [...STATUS_QUE_OCUPA_SALAO_SIMPLES]),
  ];
  if (params.ignorarReservaId) {
    condicoes.push(ne(reservas.id, params.ignorarReservaId));
  }

  const existentes = await tx
    .select({ horaInicio: reservas.horaInicio, horaFim: reservas.horaFim, numPessoas: reservas.numPessoas })
    .from(reservas)
    .where(and(...condicoes));

  const inicioMin = paraMinutos(params.horaInicio) - params.bufferMin;
  const fimMin = paraMinutos(params.horaFim) + params.bufferMin;
  const pessoasNoHorario = existentes
    .filter((r) => intervalosSeSobrepoem(inicioMin, fimMin, paraMinutos(r.horaInicio) - params.bufferMin, paraMinutos(r.horaFim) + params.bufferMin))
    .reduce((soma, r) => soma + r.numPessoas, 0);

  if (pessoasNoHorario + params.numPessoasNova > params.capacidadeTotal) {
    throw new ConflitoDeHorarioError(
      `Capacidade do salao esgotada nesse horario (${pessoasNoHorario}/${params.capacidadeTotal} ja reservados)`,
    );
  }
}

export interface AtualizarReservaParams {
  clienteNome?: string;
  clienteTelefone?: string;
  numPessoas?: number;
  mesaId?: string;
  salaoId?: string;
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

    if (
      (patch.status === "concluida" || patch.status === "no_show") &&
      !(STATUS_ATIVOS as readonly string[]).includes(atual.status)
    ) {
      throw new RequisicaoInvalidaError(
        `Nao e possivel marcar como ${STATUS_LABEL[patch.status]} uma reserva com status "${STATUS_LABEL[atual.status]}"`,
      );
    }

    if (patch.mesaId && patch.salaoId) {
      throw new RequisicaoInvalidaError("Informe no maximo um dos dois: mesaId ou salaoId");
    }

    // Se o patch nao explicita mesaId nem salaoId, mantem o "tipo" atual da reserva
    // (mapa ou simples) - trocar de tipo exige informar o novo alvo explicitamente.
    const usaSalao = patch.salaoId !== undefined ? true : patch.mesaId !== undefined ? false : atual.salaoId !== null;

    const data = patch.data ?? atual.data;
    const horaInicio = patch.horaInicio ?? atual.horaInicio;
    const numPessoas = patch.numPessoas ?? atual.numPessoas;
    let horaFim = patch.horaFim ?? atual.horaFim;
    let mesaId: string | null;
    let salaoId: string | null;

    if (usaSalao) {
      salaoId = patch.salaoId ?? atual.salaoId;
      mesaId = null;
      if (!salaoId) {
        throw new RequisicaoInvalidaError("Informe salaoId");
      }

      const mudouAlgo =
        salaoId !== atual.salaoId || data !== atual.data || horaInicio !== atual.horaInicio || numPessoas !== atual.numPessoas || !!patch.horaFim;

      if (mudouAlgo) {
        const [salao] = await tx
          .select({
            id: saloes.id,
            unidadeId: saloes.unidadeId,
            modoConfiguracao: saloes.modoConfiguracao,
            capacidadeTotal: saloes.capacidadeTotal,
          })
          .from(saloes)
          .where(eq(saloes.id, salaoId))
          .for("update");
        if (!salao) {
          throw new RecursoNaoEncontradoError("Salao nao encontrado");
        }
        if (salao.unidadeId !== unidadeId) {
          throw new RecursoNaoEncontradoError("Salao nao encontrado nesta unidade");
        }
        if (salao.modoConfiguracao !== "simples") {
          throw new RequisicaoInvalidaError("Este salao nao esta no modo simples (sem selecao de mesa)");
        }
        if (!salao.capacidadeTotal || salao.capacidadeTotal <= 0) {
          throw new RequisicaoInvalidaError("Capacidade total do salao ainda nao foi configurada");
        }
        if (numPessoas > salao.capacidadeTotal) {
          throw new RequisicaoInvalidaError(
            `Numero de pessoas maior que a capacidade total do salao (${salao.capacidadeTotal})`,
          );
        }

        const bloqueio = await bloqueioDeSalaoAtivoPara(tx, { unidadeId, salaoId, data });
        if (bloqueio) {
          throw new ConflitoDeHorarioError(`Salao bloqueado nesta data (motivo: ${bloqueio.motivo})`);
        }

        if (!patch.horaFim) {
          const janela = await resolverJanela(tx, unidadeId, data, horaInicio);
          horaFim = janela.horaFim;
        }
        const { bufferMin } = await resolverJanela(tx, unidadeId, data, horaInicio);

        await validarCapacidadeSalaoSimples(tx, {
          salaoId,
          capacidadeTotal: salao.capacidadeTotal,
          data,
          horaInicio,
          horaFim,
          bufferMin,
          numPessoasNova: numPessoas,
          ignorarReservaId: atual.id,
        });
      }
    } else {
      mesaId = patch.mesaId ?? atual.mesaId;
      salaoId = null;
      if (!mesaId) {
        throw new RequisicaoInvalidaError("Informe mesaId");
      }

      const mudouHorarioOuMesa = mesaId !== atual.mesaId || data !== atual.data || horaInicio !== atual.horaInicio || !!patch.horaFim;

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

        if (numPessoas < mesa.capacidadeMin || numPessoas > mesa.capacidadeMax) {
          throw new RequisicaoInvalidaError(
            `Numero de pessoas fora da capacidade da mesa (${mesa.capacidadeMin}-${mesa.capacidadeMax})`,
          );
        }

        const bloqueio = await bloqueioAtivoPara(tx, { unidadeId, mesaId, salaoId: mesa.salaoId, data });
        if (bloqueio) {
          throw new ConflitoDeHorarioError(`Mesa bloqueada nesta data (motivo: ${bloqueio.motivo})`);
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
    }

    try {
      const [atualizada] = await tx
        .update(reservas)
        .set({
          clienteNome: patch.clienteNome,
          clienteTelefone: patch.clienteTelefone,
          numPessoas: patch.numPessoas,
          mesaId,
          salaoId,
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

export interface CriarReservaComMesaAutomaticaParams {
  unidadeId: string;
  // Ausente no fluxo do widget embutido (doc 23) - sem thread do Instagram pra vincular.
  igSenderId?: string;
  canalOrigem: "instagram" | "widget";
  data: string;
  horaInicio: string;
  numPessoas: number;
  clienteNome: string;
  clienteTelefone?: string;
}

// Usada pela pagina publica de reserva (/reservar/:token): o cliente so escolhe
// data/horario/pessoas, sem selecionar mesa/salao. Reaproveita verificarDisponibilidade
// pra achar as opcoes com capacidade compativel e livres - prefere uma mesa (modo mapa)
// com a menor capacidade maxima que ainda comporta o grupo (evita ocupar uma mesa grande
// com um grupo pequeno); se nao houver mesa mas houver salao em modo simples com
// capacidade sobrando, usa o de menor capacidade total suficiente. A criacao em si passa
// por criarReserva, entao ganha o mesmo lock/checagem de conflito.
export async function criarReservaComMesaAutomatica(
  db: Database,
  params: CriarReservaComMesaAutomaticaParams,
): Promise<Reserva> {
  const disponibilidade = await verificarDisponibilidade(db, {
    unidadeId: params.unidadeId,
    data: params.data,
    hora: params.horaInicio,
    numPessoas: params.numPessoas,
  });

  if (!disponibilidade.disponivel) {
    throw new ConflitoDeHorarioError(disponibilidade.motivo ?? "Nao ha disponibilidade para esse horario");
  }

  const mesaEscolhida = [...disponibilidade.mesasDisponiveis].sort((a, b) => a.capacidadeMax - b.capacidadeMax)[0];
  const salaoEscolhido = [...disponibilidade.saloesSimplesDisponiveis].sort(
    (a, b) => a.capacidadeTotal - b.capacidadeTotal,
  )[0];

  if (!mesaEscolhida && !salaoEscolhido) {
    throw new ConflitoDeHorarioError("Nao ha mesas ou salao disponivel para esse horario");
  }

  return criarReserva(db, {
    unidadeId: params.unidadeId,
    mesaId: mesaEscolhida?.id,
    salaoId: mesaEscolhida ? undefined : salaoEscolhido?.id,
    data: params.data,
    horaInicio: params.horaInicio,
    numPessoas: params.numPessoas,
    clienteNome: params.clienteNome,
    clienteTelefone: params.clienteTelefone,
    igSenderId: params.igSenderId,
    canalOrigem: params.canalOrigem,
  });
}
