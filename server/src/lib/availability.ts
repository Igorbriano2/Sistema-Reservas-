import { and, eq, inArray } from "drizzle-orm";
import type { Database, Queryable } from "../db/client.js";
import { excecoesHorario, mesas, regrasHorario, reservas, saloes, unidades } from "../db/schema/index.js";
import { diaDaSemana, intervalosSeSobrepoem, minutosAteReserva, paraMinutos, somarMinutos } from "./time.js";
import { mesasBloqueadasEm, saloesBloqueadosEm } from "./bloqueios.js";

export interface TurnoResolvido {
  nome: string | null;
  descontoPercentual: number | null;
  exigeDeposito: boolean;
  valorDepositoCentavos: number | null;
}

export interface JanelaValidada {
  horaFim: string;
  bufferMin: number;
  turno?: TurnoResolvido;
}

export type ResultadoValidacaoDeJanela = { ok: true; janela: JanelaValidada } | { ok: false; motivo: string };

// Fechamento/excecao/horario de funcionamento/antecedencia minima - a parte de
// verificarDisponibilidade que NAO depende de capacidade (mesa/salao). Extraida como
// funcao propria pra tambem ser usada na EDICAO de uma reserva (atualizarReservaCom
// Condicoes em reservations.ts): mudar a data/hora de uma reserva existente precisa
// respeitar as mesmas regras que criar uma reserva nova respeita, senao da pra editar
// uma reserva pra um dia fechado ou fora do horario de funcionamento.
export async function validarJanelaDeFuncionamento(
  db: Queryable,
  params: { unidadeId: string; data: string; horaInicio: string; respeitarHorariosFixos?: boolean },
): Promise<ResultadoValidacaoDeJanela> {
  const { unidadeId, data, horaInicio, respeitarHorariosFixos } = params;

  const [excecao] = await db
    .select()
    .from(excecoesHorario)
    .where(and(eq(excecoesHorario.unidadeId, unidadeId), eq(excecoesHorario.data, data)))
    .limit(1);

  if (excecao?.fechado) {
    return { ok: false, motivo: "Unidade fechada nesta data." };
  }

  const regras = await db
    .select()
    .from(regrasHorario)
    .where(and(eq(regrasHorario.unidadeId, unidadeId), eq(regrasHorario.diaSemana, diaDaSemana(data))));

  // Excecao pode sobrescrever a janela de funcionamento do dia (ex.: horario especial de feriado),
  // mas a duracao padrao da reserva e o buffer continuam vindo da regra do dia da semana.
  const janelas = excecao?.horaAbertura && excecao?.horaFechamento
    ? [{ horaAbertura: excecao.horaAbertura, horaFechamento: excecao.horaFechamento, regra: regras[0] }]
    : regras.map((regra) => ({ horaAbertura: regra.horaAbertura, horaFechamento: regra.horaFechamento, regra }));

  if (janelas.length === 0) {
    return { ok: false, motivo: "Nenhum horario de funcionamento cadastrado para este dia." };
  }

  const inicioMin = paraMinutos(horaInicio);
  // So o INICIO precisa cair dentro do horario de funcionamento (mesmo criterio da
  // abertura) - nao exige que a reserva inteira (inicio + duracao) caiba antes do
  // fechamento. Exigir isso rejeitava a ultima hora e meia (duracaoPadraoMin) de
  // qualquer unidade, inclusive quem configura horaFechamento "23:59" pra dizer
  // "aberto o dia todo": a cozinha continua atendendo quem ja esta sentado depois do
  // horario de fechamento, o fechamento so define ate quando aceitar reserva NOVA.
  const janela = janelas.find((j) => inicioMin >= paraMinutos(j.horaAbertura) && inicioMin < paraMinutos(j.horaFechamento));

  if (!janela) {
    return { ok: false, motivo: "Fora do horario de funcionamento." };
  }

  // Horarios fixos (doc 28) - so vale pro fluxo PUBLICO (respeitarHorariosFixos=true),
  // mesmo criterio ja usado por exigeDeposito: reserva manual do dono/funcionario no
  // painel, ou edicao feita pelo proprio dono, nunca fica presa a essa restricao.
  const horariosFixos = janela.regra?.horariosFixos;
  if (respeitarHorariosFixos && horariosFixos && horariosFixos.length > 0) {
    const horaNormalizada = horaInicio.slice(0, 5);
    const permitido = horariosFixos.some((h) => h.slice(0, 5) === horaNormalizada);
    if (!permitido) {
      const lista = horariosFixos.map((h) => h.slice(0, 5)).join(", ");
      return { ok: false, motivo: `Reservas neste turno so estao disponiveis nos horarios: ${lista}.` };
    }
  }

  const duracaoPadraoMin = janela.regra?.duracaoPadraoMin ?? 90;
  const bufferMin = janela.regra?.bufferMin ?? 0;
  const horaFim = somarMinutos(horaInicio, duracaoPadraoMin);

  // Antecedencia minima do turno (doc 19) - so busca o fuso da unidade quando
  // precisa (regra padrao e 0, sem restricao).
  const antecedenciaMinMin = janela.regra?.antecedenciaMinMin ?? 0;
  if (antecedenciaMinMin > 0) {
    const [unidadeRow] = await db.select({ timezone: unidades.timezone }).from(unidades).where(eq(unidades.id, unidadeId)).limit(1);
    const minutosDisponiveis = minutosAteReserva(data, horaInicio, unidadeRow?.timezone ?? "America/Sao_Paulo");
    if (minutosDisponiveis < antecedenciaMinMin) {
      const horas = Math.floor(antecedenciaMinMin / 60);
      const minutos = antecedenciaMinMin % 60;
      const descricaoAntecedencia = [horas > 0 && `${horas}h`, minutos > 0 && `${minutos}min`].filter(Boolean).join(" ");
      return { ok: false, motivo: `Reservas neste horario precisam ser feitas com pelo menos ${descricaoAntecedencia} de antecedencia.` };
    }
  }

  const turno: TurnoResolvido | undefined = janela.regra
    ? {
        nome: janela.regra.nome,
        descontoPercentual: janela.regra.descontoPercentual,
        exigeDeposito: janela.regra.exigeDeposito,
        valorDepositoCentavos: janela.regra.valorDepositoCentavos,
      }
    : undefined;

  return { ok: true, janela: { horaFim, bufferMin, turno } };
}

export interface VerificarDisponibilidadeParams {
  unidadeId: string;
  data: string; // YYYY-MM-DD
  hora: string; // HH:MM ou HH:MM:SS
  numPessoas: number;
  // Horarios fixos (doc 28) - true nos fluxos publicos (link do agente, widget) pra
  // rejeitar horarios fora da lista configurada no turno. Admin/painel nao passa isso,
  // mesmo criterio ja usado por exigeDeposito.
  respeitarHorariosFixos?: boolean;
}

export interface MesaDisponivel {
  id: string;
  nome: string;
  salaoId: string;
  capacidadeMin: number;
  capacidadeMax: number;
}

export interface SalaoSimplesDisponivel {
  id: string;
  nome: string;
  capacidadeTotal: number;
  capacidadeDisponivel: number;
}

export interface DisponibilidadeResultado {
  disponivel: boolean;
  motivo?: string;
  horaInicio: string;
  horaFim: string;
  mesasDisponiveis: MesaDisponivel[];
  saloesSimplesDisponiveis: SalaoSimplesDisponivel[];
  // Turno (doc 19) que cobre esse horario, quando encontrado - nome e desconto sao
  // so informativos. exigeDeposito/valorDepositoCentavos (doc 22) controlam se a
  // reserva PUBLICA nesse turno precisa de deposito via Stripe antes de confirmar.
  turno?: {
    nome: string | null;
    descontoPercentual: number | null;
    exigeDeposito: boolean;
    valorDepositoCentavos: number | null;
  };
}

// Reservas nesses status "ocupam" uma mesa (modo mapa) - inclui "pendente" pra nao
// deixar duas pessoas reservarem a mesma mesa enquanto uma confirmacao esta em aberto.
const STATUS_QUE_OCUPA_MESA = ["pendente", "confirmada"] as const;
// No modo simples a capacidade e um numero agregado (nao um recurso exclusivo por
// reserva), entao so contam reservas ja confirmadas ou ja sentadas (concluida) -
// "pendente" nao chega a existir na pratica hoje (toda reserva nasce "confirmada").
const STATUS_QUE_OCUPA_SALAO_SIMPLES = ["confirmada", "concluida"] as const;

// Doc 29 - horario de reserva proprio de UM salao (independente do turno da unidade).
// "turno" (padrao) sempre aceita - so os modos "fixo"/"intervalo" restringem.
function salaoAceitaHorario(
  salao: {
    modoHorarioReserva: "turno" | "fixo" | "intervalo";
    horariosFixos: string[] | null;
    intervaloInicio: string | null;
    intervaloFim: string | null;
  },
  horaInicio: string,
  respeitarHorariosFixos: boolean | undefined,
): boolean {
  if (!respeitarHorariosFixos || salao.modoHorarioReserva === "turno") return true;
  if (salao.modoHorarioReserva === "fixo") {
    const horaNormalizada = horaInicio.slice(0, 5);
    return (salao.horariosFixos ?? []).some((h) => h.slice(0, 5) === horaNormalizada);
  }
  // "intervalo"
  if (!salao.intervaloInicio || !salao.intervaloFim) return false;
  return horaInicio >= salao.intervaloInicio && horaInicio < salao.intervaloFim;
}

// Lista os horarios de INICIO fixos aceitos pra reserva PUBLICA nessa data, quando a
// unidade/salao restringe a horarios especificos (docs 28/29) - usado pelo frontend
// pra trocar o campo livre de horario por uma lista de opcoes, em vez do cliente
// so descobrir depois de tentar (ver validarJanelaDeFuncionamento/salaoAceitaHorario,
// que continuam sendo a validacao de verdade no submit). Retorna null quando NAO ha
// restricao de horario fixo nessa data (turno livre, sem horariosFixos configurado em
// nenhum lugar) - nesse caso o frontend mantem o campo de horario livre normal.
export async function listarHorariosFixosDoDia(
  db: Queryable,
  params: { unidadeId: string; data: string },
): Promise<string[] | null> {
  const { unidadeId, data } = params;

  const [excecao] = await db
    .select()
    .from(excecoesHorario)
    .where(and(eq(excecoesHorario.unidadeId, unidadeId), eq(excecoesHorario.data, data)))
    .limit(1);
  if (excecao?.fechado) {
    return [];
  }

  const regras = await db
    .select({ horariosFixos: regrasHorario.horariosFixos })
    .from(regrasHorario)
    .where(and(eq(regrasHorario.unidadeId, unidadeId), eq(regrasHorario.diaSemana, diaDaSemana(data))));

  const horariosDoTurno = new Set<string>();
  for (const regra of regras) {
    for (const h of regra.horariosFixos ?? []) horariosDoTurno.add(h.slice(0, 5));
  }
  if (horariosDoTurno.size > 0) {
    return [...horariosDoTurno].sort();
  }

  const todosSaloes = await db
    .select({
      modoHorarioReserva: saloes.modoHorarioReserva,
      horariosFixos: saloes.horariosFixos,
      dataEspecifica: saloes.dataEspecifica,
    })
    .from(saloes)
    .where(eq(saloes.unidadeId, unidadeId));

  const horariosDoSalao = new Set<string>();
  for (const salao of todosSaloes) {
    if (salao.dataEspecifica && salao.dataEspecifica !== data) continue;
    if (salao.modoHorarioReserva !== "fixo") continue;
    for (const h of salao.horariosFixos ?? []) horariosDoSalao.add(h.slice(0, 5));
  }
  if (horariosDoSalao.size > 0) {
    return [...horariosDoSalao].sort();
  }

  return null;
}

export async function verificarDisponibilidade(
  db: Database,
  params: VerificarDisponibilidadeParams,
): Promise<DisponibilidadeResultado> {
  const { unidadeId, data, numPessoas } = params;
  const horaInicio = params.hora.length === 5 ? `${params.hora}:00` : params.hora;
  const semDisponibilidade = (motivo: string): DisponibilidadeResultado => ({
    disponivel: false,
    motivo,
    horaInicio,
    horaFim: horaInicio,
    mesasDisponiveis: [],
    saloesSimplesDisponiveis: [],
  });

  const validacaoDaJanela = await validarJanelaDeFuncionamento(db, {
    unidadeId,
    data,
    horaInicio,
    respeitarHorariosFixos: params.respeitarHorariosFixos,
  });
  if (!validacaoDaJanela.ok) {
    return semDisponibilidade(validacaoDaJanela.motivo);
  }
  const { horaFim, bufferMin, turno } = validacaoDaJanela.janela;
  const inicioMin = paraMinutos(horaInicio);
  const fimMin = paraMinutos(horaFim);

  const todosSaloesDaUnidade = await db
    .select({
      id: saloes.id,
      nome: saloes.nome,
      modoConfiguracao: saloes.modoConfiguracao,
      capacidadeTotal: saloes.capacidadeTotal,
      modoHorarioReserva: saloes.modoHorarioReserva,
      horariosFixos: saloes.horariosFixos,
      intervaloInicio: saloes.intervaloInicio,
      intervaloFim: saloes.intervaloFim,
      dataEspecifica: saloes.dataEspecifica,
    })
    .from(saloes)
    .where(eq(saloes.unidadeId, unidadeId));

  if (todosSaloesDaUnidade.length === 0) {
    return semDisponibilidade("Nenhum salao cadastrado para esta unidade.");
  }

  // Doc 30 - salao de campanha (data_especifica preenchida): so existe pra reserva
  // NAQUELA data, tanto no fluxo publico quanto na reserva manual do painel (nao e uma
  // restricao "so pro cliente" como horariosFixos - o salao literalmente nao existe em
  // outro dia, ex: mesas extras montadas so pro Dia dos Namorados).
  const todosSaloesComHorario = todosSaloesDaUnidade.filter((s) => !s.dataEspecifica || s.dataEspecifica === data);

  // Doc 29 - horario de reserva proprio do salao, alem da janela do turno acima: so
  // vale pro fluxo PUBLICO (mesmo criterio de horariosFixos do turno). Um salao com
  // modoHorarioReserva "turno" (padrao) nunca e filtrado aqui.
  const todosSaloes = todosSaloesComHorario.filter((s) => salaoAceitaHorario(s, horaInicio, params.respeitarHorariosFixos));

  if (todosSaloes.length === 0) {
    return semDisponibilidade(
      todosSaloesComHorario.length === 0 ? "Nenhum salao disponivel nesta data." : "Nenhum salao aceita reserva nesse horario.",
    );
  }

  const saloesMapaIds = todosSaloes.filter((s) => s.modoConfiguracao === "mapa").map((s) => s.id);
  const saloesSimplesCandidatos = todosSaloes.filter(
    (s) => s.modoConfiguracao === "simples" && (s.capacidadeTotal ?? 0) > 0,
  );

  // --- Modo "mapa": mesas com capacidade compativel, sem bloqueio e sem sobreposicao ---
  let mesasDisponiveis: MesaDisponivel[] = [];
  if (saloesMapaIds.length > 0) {
    const mesasCandidatas = await db
      .select({
        id: mesas.id,
        nome: mesas.nome,
        salaoId: mesas.salaoId,
        capacidadeMin: mesas.capacidadeMin,
        capacidadeMax: mesas.capacidadeMax,
      })
      .from(mesas)
      .where(inArray(mesas.salaoId, saloesMapaIds));

    const mesasCompativeis = mesasCandidatas.filter(
      (m) => numPessoas >= m.capacidadeMin && numPessoas <= m.capacidadeMax,
    );

    if (mesasCompativeis.length > 0) {
      const salaoIdPorMesa = new Map(mesasCompativeis.map((m) => [m.id, m.salaoId]));
      const mesasBloqueadas = await mesasBloqueadasEm(db, {
        unidadeId,
        data,
        mesaIds: mesasCompativeis.map((m) => m.id),
        salaoIdPorMesa,
      });
      const mesasNaoBloqueadas = mesasCompativeis.filter((m) => !mesasBloqueadas.has(m.id));

      if (mesasNaoBloqueadas.length > 0) {
        const mesaIds = mesasNaoBloqueadas.map((m) => m.id);
        const reservasDoDia = await db
          .select({ mesaId: reservas.mesaId, horaInicio: reservas.horaInicio, horaFim: reservas.horaFim })
          .from(reservas)
          .where(
            and(
              eq(reservas.unidadeId, unidadeId),
              eq(reservas.data, data),
              inArray(reservas.mesaId, mesaIds),
              inArray(reservas.status, [...STATUS_QUE_OCUPA_MESA]),
            ),
          );

        const ocupacaoPorMesa = new Map<string, { inicio: number; fim: number }[]>();
        for (const r of reservasDoDia) {
          if (!r.mesaId) continue;
          const lista = ocupacaoPorMesa.get(r.mesaId) ?? [];
          lista.push({ inicio: paraMinutos(r.horaInicio) - bufferMin, fim: paraMinutos(r.horaFim) + bufferMin });
          ocupacaoPorMesa.set(r.mesaId, lista);
        }

        mesasDisponiveis = mesasNaoBloqueadas.filter((mesa) => {
          const ocupacoes = ocupacaoPorMesa.get(mesa.id) ?? [];
          return !ocupacoes.some((o) => intervalosSeSobrepoem(inicioMin, fimMin, o.inicio, o.fim));
        });
      }
    }
  }

  // --- Modo "simples": saloes com capacidade total agregada suficiente no horario ---
  let saloesSimplesDisponiveis: SalaoSimplesDisponivel[] = [];
  if (saloesSimplesCandidatos.length > 0) {
    const salaoIds = saloesSimplesCandidatos.map((s) => s.id);
    const salaoesBloqueados = await saloesBloqueadosEm(db, { unidadeId, data, salaoIds });
    const saloesLivres = saloesSimplesCandidatos.filter((s) => !salaoesBloqueados.has(s.id));

    if (saloesLivres.length > 0) {
      const saloesLivresIds = saloesLivres.map((s) => s.id);
      const reservasDoDia = await db
        .select({
          salaoId: reservas.salaoId,
          horaInicio: reservas.horaInicio,
          horaFim: reservas.horaFim,
          numPessoas: reservas.numPessoas,
        })
        .from(reservas)
        .where(
          and(
            eq(reservas.unidadeId, unidadeId),
            eq(reservas.data, data),
            inArray(reservas.salaoId, saloesLivresIds),
            inArray(reservas.status, [...STATUS_QUE_OCUPA_SALAO_SIMPLES]),
          ),
        );

      const ocupacaoPorSalao = new Map<string, number>();
      for (const r of reservasDoDia) {
        if (!r.salaoId) continue;
        const sobrepoe = intervalosSeSobrepoem(
          inicioMin,
          fimMin,
          paraMinutos(r.horaInicio) - bufferMin,
          paraMinutos(r.horaFim) + bufferMin,
        );
        if (sobrepoe) {
          ocupacaoPorSalao.set(r.salaoId, (ocupacaoPorSalao.get(r.salaoId) ?? 0) + r.numPessoas);
        }
      }

      saloesSimplesDisponiveis = saloesLivres
        .map((s) => ({
          id: s.id,
          nome: s.nome,
          capacidadeTotal: s.capacidadeTotal!,
          capacidadeDisponivel: s.capacidadeTotal! - (ocupacaoPorSalao.get(s.id) ?? 0),
        }))
        .filter((s) => s.capacidadeDisponivel >= numPessoas);
    }
  }

  if (mesasDisponiveis.length === 0 && saloesSimplesDisponiveis.length === 0) {
    return semDisponibilidade("Sem capacidade disponivel (mesas ou salao) para esse horario e numero de pessoas.");
  }

  return { disponivel: true, horaInicio, horaFim, mesasDisponiveis, saloesSimplesDisponiveis, turno };
}
