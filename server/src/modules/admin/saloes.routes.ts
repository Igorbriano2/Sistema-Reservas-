import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { saloes } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { RecursoNaoEncontradoError, RequisicaoInvalidaError } from "../../lib/errors.js";
import { codigoDoErroPostgres } from "../../lib/pg-error.js";

export const saloesRouter = Router({ mergeParams: true });

const PG_FOREIGN_KEY_VIOLATION = "23503";

const modoConfiguracaoSchema = z.enum(["simples", "mapa"]);

// Doc 29 - horario de reserva proprio do salao (alem do turno da unidade). "turno"
// (padrao) nao usa horariosFixos/intervalo* - so a janela do turno vale.
const modoHorarioReservaSchema = z.enum(["turno", "fixo", "intervalo"]);
const horaSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use o formato HH:MM");

const criarSalaoSchema = z.object({
  nome: z.string().min(1),
  modoConfiguracao: modoConfiguracaoSchema.optional(),
  capacidadeTotal: z.number().int().positive().optional(),
  modoHorarioReserva: modoHorarioReservaSchema.optional(),
  horariosFixos: z.array(horaSchema).max(20).nullable().optional(),
  intervaloInicio: horaSchema.nullable().optional(),
  intervaloFim: horaSchema.nullable().optional(),
});
const atualizarSalaoSchema = criarSalaoSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Informe ao menos um campo para atualizar");

// Doc 29 - garante que os campos batem com o modo escolhido: "fixo" precisa de pelo
// menos um horario em horariosFixos, "intervalo" precisa dos dois limites (com fim
// depois do inicio - o banco tambem tem essa checagem, mas validar aqui devolve uma
// mensagem clara em vez do erro cru do Postgres).
function validarModoHorarioReserva(dados: {
  modoHorarioReserva?: "turno" | "fixo" | "intervalo";
  horariosFixos?: string[] | null;
  intervaloInicio?: string | null;
  intervaloFim?: string | null;
}): void {
  if (dados.modoHorarioReserva === "fixo" && (!dados.horariosFixos || dados.horariosFixos.length === 0)) {
    throw new RequisicaoInvalidaError("Informe ao menos um horario fixo");
  }
  if (dados.modoHorarioReserva === "intervalo") {
    if (!dados.intervaloInicio || !dados.intervaloFim) {
      throw new RequisicaoInvalidaError("Informe o inicio e o fim do intervalo");
    }
    if (dados.intervaloFim <= dados.intervaloInicio) {
      throw new RequisicaoInvalidaError("O fim do intervalo deve ser depois do inicio");
    }
  }
}

saloesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const lista = await db.select().from(saloes).where(eq(saloes.unidadeId, req.unidadeId!));
    res.json(lista);
  }),
);

saloesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const dados = criarSalaoSchema.parse(req.body);
    validarModoHorarioReserva(dados);
    const [salao] = await db.insert(saloes).values({ unidadeId: req.unidadeId!, ...dados }).returning();
    res.status(201).json(salao);
  }),
);

saloesRouter.patch(
  "/:salaoId",
  asyncHandler(async (req, res) => {
    const dados = atualizarSalaoSchema.parse(req.body);
    if (dados.modoHorarioReserva) {
      const [atual] = await db
        .select({ horariosFixos: saloes.horariosFixos, intervaloInicio: saloes.intervaloInicio, intervaloFim: saloes.intervaloFim })
        .from(saloes)
        .where(and(eq(saloes.id, req.params.salaoId), eq(saloes.unidadeId, req.unidadeId!)))
        .limit(1);
      if (!atual) throw new RecursoNaoEncontradoError("Salao nao encontrado");
      validarModoHorarioReserva({
        modoHorarioReserva: dados.modoHorarioReserva,
        horariosFixos: dados.horariosFixos !== undefined ? dados.horariosFixos : atual.horariosFixos,
        intervaloInicio: dados.intervaloInicio !== undefined ? dados.intervaloInicio : atual.intervaloInicio,
        intervaloFim: dados.intervaloFim !== undefined ? dados.intervaloFim : atual.intervaloFim,
      });
    }
    const [salao] = await db
      .update(saloes)
      .set(dados)
      .where(and(eq(saloes.id, req.params.salaoId), eq(saloes.unidadeId, req.unidadeId!)))
      .returning();
    if (!salao) throw new RecursoNaoEncontradoError("Salao nao encontrado");
    res.json(salao);
  }),
);

saloesRouter.delete(
  "/:salaoId",
  asyncHandler(async (req, res) => {
    let salao;
    try {
      [salao] = await db
        .delete(saloes)
        .where(and(eq(saloes.id, req.params.salaoId), eq(saloes.unidadeId, req.unidadeId!)))
        .returning();
    } catch (err) {
      // reservas.salao_id/mesa_id sao "restrict" de proposito (nunca perder o historico
      // de uma reserva ja feita, mesmo excluindo o salao/mesa) - qualquer salao que ja
      // teve reserva (inclusive antiga/cancelada) bate nessa violacao ao tentar excluir.
      if (codigoDoErroPostgres(err) === PG_FOREIGN_KEY_VIOLATION) {
        throw new RequisicaoInvalidaError(
          "Não é possível excluir: este salão já tem reservas registradas (inclusive antigas). Para não usá-lo mais, edite e remova a capacidade/mesas em vez de excluir.",
        );
      }
      throw err;
    }
    if (!salao) throw new RecursoNaoEncontradoError("Salao nao encontrado");
    res.status(204).send();
  }),
);
