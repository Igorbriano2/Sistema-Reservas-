import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { excecoesHorario, mesas, regrasHorario, reservas, saloes } from "../db/schema/index.js";
import { diaDaSemana, intervalosSeSobrepoem, paraMinutos, somarMinutos } from "./time.js";

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

export interface DisponibilidadeResultado {
  disponivel: boolean;
  motivo?: string;
  horaInicio: string;
  horaFim: string;
  mesasDisponiveis: MesaDisponivel[];
}

const STATUS_QUE_OCUPA_MESA = ["pendente", "confirmada"] as const;

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

  const mesasCandidatas = await db
    .select({
      id: mesas.id,
      nome: mesas.nome,
      salaoId: mesas.salaoId,
      capacidadeMin: mesas.capacidadeMin,
      capacidadeMax: mesas.capacidadeMax,
    })
    .from(mesas)
    .innerJoin(saloes, eq(mesas.salaoId, saloes.id))
    .where(eq(saloes.unidadeId, unidadeId));

  const mesasCompativeis = mesasCandidatas.filter(
    (m) => numPessoas >= m.capacidadeMin && numPessoas <= m.capacidadeMax,
  );

  if (mesasCompativeis.length === 0) {
    return semDisponibilidade("Nenhuma mesa com capacidade compativel para este numero de pessoas.");
  }

  const mesaIds = mesasCompativeis.map((m) => m.id);
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
    const lista = ocupacaoPorMesa.get(r.mesaId) ?? [];
    lista.push({ inicio: paraMinutos(r.horaInicio) - bufferMin, fim: paraMinutos(r.horaFim) + bufferMin });
    ocupacaoPorMesa.set(r.mesaId, lista);
  }

  const mesasDisponiveis = mesasCompativeis.filter((mesa) => {
    const ocupacoes = ocupacaoPorMesa.get(mesa.id) ?? [];
    return !ocupacoes.some((o) => intervalosSeSobrepoem(inicioMin, fimMin, o.inicio, o.fim));
  });

  if (mesasDisponiveis.length === 0) {
    return semDisponibilidade("Todas as mesas compativeis ja estao reservadas neste horario.");
  }

  return { disponivel: true, horaInicio, horaFim, mesasDisponiveis };
}
