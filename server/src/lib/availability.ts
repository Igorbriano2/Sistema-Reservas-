import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { excecoesHorario, mesas, regrasHorario, reservas, saloes, unidades } from "../db/schema/index.js";
import { diaDaSemana, intervalosSeSobrepoem, minutosAteReserva, paraMinutos, somarMinutos } from "./time.js";
import { mesasBloqueadasEm, saloesBloqueadosEm } from "./bloqueios.js";

export interface VerificarDisponibilidadeParams {
  unidadeId: string;
  data: string; // YYYY-MM-DD
  hora: string; // HH:MM ou HH:MM:SS
  numPessoas: number;
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
  // so informativos (o desconto nao afeta cobranca, nao ha reserva paga no MVP).
  turno?: { nome: string | null; descontoPercentual: number | null };
}

// Reservas nesses status "ocupam" uma mesa (modo mapa) - inclui "pendente" pra nao
// deixar duas pessoas reservarem a mesma mesa enquanto uma confirmacao esta em aberto.
const STATUS_QUE_OCUPA_MESA = ["pendente", "confirmada"] as const;
// No modo simples a capacidade e um numero agregado (nao um recurso exclusivo por
// reserva), entao so contam reservas ja confirmadas ou ja sentadas (concluida) -
// "pendente" nao chega a existir na pratica hoje (toda reserva nasce "confirmada").
const STATUS_QUE_OCUPA_SALAO_SIMPLES = ["confirmada", "concluida"] as const;

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

  const [excecao] = await db
    .select()
    .from(excecoesHorario)
    .where(and(eq(excecoesHorario.unidadeId, unidadeId), eq(excecoesHorario.data, data)))
    .limit(1);

  if (excecao?.fechado) {
    return semDisponibilidade("Unidade fechada nesta data.");
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
    return semDisponibilidade("Nenhum horario de funcionamento cadastrado para este dia.");
  }

  const inicioMin = paraMinutos(horaInicio);
  const janela = janelas.find((j) => {
    const duracao = j.regra?.duracaoPadraoMin ?? 90;
    return inicioMin >= paraMinutos(j.horaAbertura) && inicioMin + duracao <= paraMinutos(j.horaFechamento);
  });

  if (!janela) {
    return semDisponibilidade("Fora do horario de funcionamento.");
  }

  const duracaoPadraoMin = janela.regra?.duracaoPadraoMin ?? 90;
  const bufferMin = janela.regra?.bufferMin ?? 0;
  const horaFim = somarMinutos(horaInicio, duracaoPadraoMin);
  const fimMin = inicioMin + duracaoPadraoMin;

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
      return semDisponibilidade(`Reservas neste horario precisam ser feitas com pelo menos ${descricaoAntecedencia} de antecedencia.`);
    }
  }

  const turno = janela.regra
    ? { nome: janela.regra.nome, descontoPercentual: janela.regra.descontoPercentual }
    : undefined;

  const todosSaloes = await db
    .select({
      id: saloes.id,
      nome: saloes.nome,
      modoConfiguracao: saloes.modoConfiguracao,
      capacidadeTotal: saloes.capacidadeTotal,
    })
    .from(saloes)
    .where(eq(saloes.unidadeId, unidadeId));

  if (todosSaloes.length === 0) {
    return semDisponibilidade("Nenhum salao cadastrado para esta unidade.");
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
