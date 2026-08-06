import { and, eq, gte, lte } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { excecoesHorario, mesas, regrasHorario, reservas, saloes } from "../db/schema/index.js";
import { diaDaSemana, enumerarDatas, paraMinutos } from "./time.js";

export interface RelatorioParams {
  unidadeId: string;
  dataInicio: string;
  dataFim: string;
}

export interface RelatorioResultado {
  periodo: { dataInicio: string; dataFim: string };
  // "Slot" = uma vaga teorica de reserva (duracao padrao + buffer) dentro do horario
  // de funcionamento de uma mesa num dia. capacidadeSlots soma isso pra todas as
  // mesas em todos os dias do periodo - a "capacidade total" contra a qual a
  // ocupacao real e comparada. Nao desconta mesas bloqueadas (ver bloqueios.ts).
  ocupacao: { capacidadeSlots: number; reservasOcupando: number; taxa: number | null };
  naoComparecimento: { totalReservas: number; totalNaoCompareceu: number; taxa: number | null };
  mesasMaisPedidas: Array<{ mesaId: string; mesaNome: string; totalReservas: number }>;
}

// Reservas que efetivamente "ocupam" a mesa pro calculo de ocupacao: confirmada
// (vai acontecer) e concluida (aconteceu - cliente sentou). Pendente/cancelada/
// no_show nao contam como ocupacao real.
const STATUS_QUE_OCUPA = new Set(["confirmada", "concluida"]);

export async function gerarRelatorio(db: Database, params: RelatorioParams): Promise<RelatorioResultado> {
  const { unidadeId, dataInicio, dataFim } = params;

  const [todasMesas, todasRegras, excecoes, reservasDoPeriodo] = await Promise.all([
    db
      .select({ id: mesas.id, nome: mesas.nome })
      .from(mesas)
      .innerJoin(saloes, eq(mesas.salaoId, saloes.id))
      .where(eq(saloes.unidadeId, unidadeId)),
    db.select().from(regrasHorario).where(eq(regrasHorario.unidadeId, unidadeId)),
    db
      .select()
      .from(excecoesHorario)
      .where(
        and(eq(excecoesHorario.unidadeId, unidadeId), gte(excecoesHorario.data, dataInicio), lte(excecoesHorario.data, dataFim)),
      ),
    db
      .select({ id: reservas.id, mesaId: reservas.mesaId, status: reservas.status })
      .from(reservas)
      .where(and(eq(reservas.unidadeId, unidadeId), gte(reservas.data, dataInicio), lte(reservas.data, dataFim))),
  ]);

  const excecaoPorData = new Map(excecoes.map((e) => [e.data, e]));
  const regrasPorDiaSemana = new Map<number, typeof todasRegras>();
  for (const regra of todasRegras) {
    const lista = regrasPorDiaSemana.get(regra.diaSemana) ?? [];
    lista.push(regra);
    regrasPorDiaSemana.set(regra.diaSemana, lista);
  }

  function slotsNoDia(data: string): number {
    const excecao = excecaoPorData.get(data);
    if (excecao?.fechado) return 0;

    const regrasDoDia = regrasPorDiaSemana.get(diaDaSemana(data)) ?? [];
    const janelas =
      excecao?.horaAbertura && excecao?.horaFechamento
        ? [
            {
              horaAbertura: excecao.horaAbertura,
              horaFechamento: excecao.horaFechamento,
              duracaoPadraoMin: regrasDoDia[0]?.duracaoPadraoMin ?? 90,
              bufferMin: regrasDoDia[0]?.bufferMin ?? 0,
            },
          ]
        : regrasDoDia;

    let slots = 0;
    for (const janela of janelas) {
      const duracaoJanela = paraMinutos(janela.horaFechamento) - paraMinutos(janela.horaAbertura);
      const duracaoPorReserva = janela.duracaoPadraoMin + janela.bufferMin;
      if (duracaoPorReserva > 0 && duracaoJanela > 0) {
        slots += Math.floor(duracaoJanela / duracaoPorReserva);
      }
    }
    return slots;
  }

  const totalMesas = todasMesas.length;
  let capacidadeSlots = 0;
  for (const data of enumerarDatas(dataInicio, dataFim)) {
    capacidadeSlots += slotsNoDia(data) * totalMesas;
  }

  const reservasOcupando = reservasDoPeriodo.filter((r) => STATUS_QUE_OCUPA.has(r.status)).length;
  const totalNaoCompareceu = reservasDoPeriodo.filter((r) => r.status === "no_show").length;
  const totalReservas = reservasDoPeriodo.length;

  // Reservas do modo "simples" nao tem mesa_id (sao contra um salao inteiro) - ficam
  // de fora deste ranking especifico por mesa, mas continuam contando nas metricas
  // gerais (ocupacao/nao comparecimento) acima.
  const contagemPorMesa = new Map<string, number>();
  for (const r of reservasDoPeriodo) {
    if (!r.mesaId) continue;
    contagemPorMesa.set(r.mesaId, (contagemPorMesa.get(r.mesaId) ?? 0) + 1);
  }
  const nomePorMesa = new Map(todasMesas.map((m) => [m.id, m.nome]));
  const mesasMaisPedidas = [...contagemPorMesa.entries()]
    .map(([mesaId, total]) => ({ mesaId, mesaNome: nomePorMesa.get(mesaId) ?? "-", totalReservas: total }))
    .sort((a, b) => b.totalReservas - a.totalReservas);

  return {
    periodo: { dataInicio, dataFim },
    ocupacao: {
      capacidadeSlots,
      reservasOcupando,
      taxa: capacidadeSlots > 0 ? reservasOcupando / capacidadeSlots : null,
    },
    naoComparecimento: {
      totalReservas,
      totalNaoCompareceu,
      taxa: totalReservas > 0 ? totalNaoCompareceu / totalReservas : null,
    },
    mesasMaisPedidas,
  };
}
