import { and, eq } from "drizzle-orm";
import type { Queryable } from "../db/client.js";
import { excecoesHorario } from "../db/schema/index.js";
import { diaDaSemana } from "./time.js";

// Algoritmo de Gauss/Meeus pra data da Pascoa (calendario gregoriano) - usado so pra
// derivar as datas moveis abaixo, sem depender de biblioteca externa.
function calcularPascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function somarDias(dataISO: string, dias: number): string {
  const data = new Date(`${dataISO}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

// Feriados nacionais fixos (data igual todo ano) - todos oficiais por lei federal.
function feriadosFixosDoAno(ano: number): Array<{ data: string; nome: string }> {
  return [
    { data: `${ano}-01-01`, nome: "Confraternizacao Universal" },
    { data: `${ano}-04-21`, nome: "Tiradentes" },
    { data: `${ano}-05-01`, nome: "Dia do Trabalho" },
    { data: `${ano}-09-07`, nome: "Independencia do Brasil" },
    { data: `${ano}-10-12`, nome: "Nossa Senhora Aparecida" },
    { data: `${ano}-11-02`, nome: "Finados" },
    { data: `${ano}-11-15`, nome: "Proclamacao da Republica" },
    { data: `${ano}-11-20`, nome: "Dia Nacional de Zumbi e da Consciencia Negra" },
    { data: `${ano}-12-25`, nome: "Natal" },
  ];
}

// Datas moveis calculadas a partir da Pascoa. Carnaval e Corpus Christi sao ponto
// facultativo (nao feriado federal por lei), mas na pratica movem MUITO o fluxo de
// restaurante - por isso entram aqui tambem pro calculo do valor do rodizio; so a
// Sexta-feira Santa e feriado federal de fato.
function feriadosMoveisDoAno(ano: number): Array<{ data: string; nome: string }> {
  const pascoa = calcularPascoa(ano);
  return [
    { data: somarDias(pascoa, -47), nome: "Carnaval (segunda)" },
    { data: somarDias(pascoa, -46), nome: "Carnaval (terca)" },
    { data: somarDias(pascoa, -2), nome: "Sexta-feira Santa" },
    { data: somarDias(pascoa, 60), nome: "Corpus Christi" },
  ];
}

// So calcula pro ano da propria data e, perto da virada do ano (ex: 2 de janeiro
// perguntando pela vespera de 1 de janeiro do ano anterior), tambem o ano vizinho -
// evita ficar refazendo a lista completa de anos toda hora.
function feriadosNacionaisRelevantes(dataISO: string): Array<{ data: string; nome: string }> {
  const ano = Number(dataISO.slice(0, 4));
  return [...feriadosFixosDoAno(ano - 1), ...feriadosFixosDoAno(ano), ...feriadosFixosDoAno(ano + 1), ...feriadosMoveisDoAno(ano - 1), ...feriadosMoveisDoAno(ano), ...feriadosMoveisDoAno(ano + 1)];
}

async function nomeDoFeriadoNaData(db: Queryable, unidadeId: string, dataISO: string): Promise<string | null> {
  const nacional = feriadosNacionaisRelevantes(dataISO).find((f) => f.data === dataISO);
  if (nacional) return nacional.nome;

  // Feriado/data especial municipal - o dono cadastra uma vez em excecoes_horario
  // (Horarios > Feriados e datas especiais), nao precisamos de tabela separada.
  const [excecao] = await db
    .select({ nome: excecoesHorario.nome })
    .from(excecoesHorario)
    .where(and(eq(excecoesHorario.unidadeId, unidadeId), eq(excecoesHorario.data, dataISO)))
    .limit(1);
  return excecao ? (excecao.nome ?? "Data especial") : null;
}

const NOMES_DIA_SEMANA = ["domingo", "segunda-feira", "terca-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sabado"];

export interface TierRodizio {
  tier: "dia_util" | "fim_de_semana_feriado";
  motivo: string;
}

// Regra do rodizio (doc 26): segunda a quinta = dia_util; sexta, sabado, domingo,
// feriado (nacional ou municipal cadastrado) e vespera de feriado = fim_de_semana_feriado.
export async function resolverTierDoRodizio(db: Queryable, unidadeId: string, dataISO: string): Promise<TierRodizio> {
  const dia = diaDaSemana(dataISO);
  if (dia === 5 || dia === 6 || dia === 0) {
    return { tier: "fim_de_semana_feriado", motivo: NOMES_DIA_SEMANA[dia] };
  }

  const feriadoHoje = await nomeDoFeriadoNaData(db, unidadeId, dataISO);
  if (feriadoHoje) {
    return { tier: "fim_de_semana_feriado", motivo: `feriado (${feriadoHoje})` };
  }

  const amanha = somarDias(dataISO, 1);
  const feriadoAmanha = await nomeDoFeriadoNaData(db, unidadeId, amanha);
  if (feriadoAmanha) {
    return { tier: "fim_de_semana_feriado", motivo: `vespera de feriado (${feriadoAmanha})` };
  }

  return { tier: "dia_util", motivo: `${NOMES_DIA_SEMANA[dia]}-feira` };
}
