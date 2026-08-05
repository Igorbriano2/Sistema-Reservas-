import { db } from "../../src/db/client.js";
import { mesas, regrasHorario, saloes } from "../../src/db/schema/index.js";

export async function criarSalao(unidadeId: string, nome = "Salao Principal") {
  const [salao] = await db.insert(saloes).values({ unidadeId, nome }).returning();
  return salao;
}

export async function criarMesa(
  salaoId: string,
  overrides: Partial<{ nome: string; capacidadeMin: number; capacidadeMax: number }> = {},
) {
  const [mesa] = await db
    .insert(mesas)
    .values({
      salaoId,
      nome: overrides.nome ?? "Mesa 1",
      capacidadeMin: overrides.capacidadeMin ?? 1,
      capacidadeMax: overrides.capacidadeMax ?? 4,
    })
    .returning();
  return mesa;
}

// Regra de horario cobrindo todos os dias da semana, das 11:00 as 23:00.
export async function criarRegraHorarioTodosOsDias(
  unidadeId: string,
  overrides: Partial<{ duracaoPadraoMin: number; bufferMin: number; horaAbertura: string; horaFechamento: string }> = {},
) {
  const regras = [];
  for (let dia = 0; dia <= 6; dia++) {
    const [regra] = await db
      .insert(regrasHorario)
      .values({
        unidadeId,
        diaSemana: dia,
        horaAbertura: overrides.horaAbertura ?? "11:00",
        horaFechamento: overrides.horaFechamento ?? "23:00",
        duracaoPadraoMin: overrides.duracaoPadraoMin ?? 90,
        bufferMin: overrides.bufferMin ?? 0,
      })
      .returning();
    regras.push(regra);
  }
  return regras;
}
