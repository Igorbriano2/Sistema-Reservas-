import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { regrasHorario } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { RecursoNaoEncontradoError, RequisicaoInvalidaError } from "../../lib/errors.js";
import { codigoDoErroPostgres } from "../../lib/pg-error.js";

const PG_CHECK_VIOLATION = "23514";

export const regrasHorarioRouter = Router({ mergeParams: true });

const horaSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use o formato HH:MM");

const criarRegraSchema = z.object({
  diaSemana: z.number().int().min(0).max(6),
  // Nome do turno (doc 19) - ex: "Almoco", "Jantar". Opcional, so pra organizar
  // quando ha mais de um bloco de horario no mesmo dia.
  nome: z.string().trim().min(1).max(60).optional(),
  horaAbertura: horaSchema,
  horaFechamento: horaSchema,
  duracaoPadraoMin: z.number().int().positive().optional(),
  bufferMin: z.number().int().min(0).optional(),
  antecedenciaMinMin: z.number().int().min(0).optional(),
  descontoPercentual: z.number().int().min(0).max(100).optional(),
  // Doc 22 - deposito exigido pra confirmar reserva PUBLICA nesse turno.
  exigeDeposito: z.boolean().optional(),
  valorDepositoCentavos: z.number().int().positive().optional(),
  // Doc 28 - quando preenchido, a reserva PUBLICA (link do agente, widget) so aceita
  // esses horarios de inicio (ex.: ["19:00"]); array vazio ou nulo = qualquer horario
  // dentro da janela abertura/fechamento (comportamento anterior).
  horariosFixos: z.array(horaSchema).max(20).nullable().optional(),
});

const atualizarRegraSchema = criarRegraSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Informe ao menos um campo para atualizar");

function validarHorariosFixosDentroDaJanela(
  horariosFixos: string[] | null | undefined,
  horaAbertura: string,
  horaFechamento: string,
): void {
  if (!horariosFixos || horariosFixos.length === 0) return;
  const foraDaJanela = horariosFixos.some((h) => h < horaAbertura || h >= horaFechamento);
  if (foraDaJanela) {
    throw new RequisicaoInvalidaError("Todo horario fixo deve estar dentro da janela de abertura/fechamento do turno");
  }
}

regrasHorarioRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const lista = await db.select().from(regrasHorario).where(eq(regrasHorario.unidadeId, req.unidadeId!));
    res.json(lista);
  }),
);

regrasHorarioRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const dados = criarRegraSchema.parse(req.body);
    if (dados.horaFechamento <= dados.horaAbertura) {
      throw new RequisicaoInvalidaError("horaFechamento deve ser depois de horaAbertura");
    }
    if (dados.exigeDeposito && !dados.valorDepositoCentavos) {
      throw new RequisicaoInvalidaError("Informe o valor do deposito");
    }
    validarHorariosFixosDentroDaJanela(dados.horariosFixos, dados.horaAbertura, dados.horaFechamento);
    try {
      const [regra] = await db
        .insert(regrasHorario)
        .values({ unidadeId: req.unidadeId!, ...dados })
        .returning();
      res.status(201).json(regra);
    } catch (err) {
      if (codigoDoErroPostgres(err) === PG_CHECK_VIOLATION) {
        throw new RequisicaoInvalidaError("Informe o valor do deposito");
      }
      throw err;
    }
  }),
);

regrasHorarioRouter.patch(
  "/:regraId",
  asyncHandler(async (req, res) => {
    const dados = atualizarRegraSchema.parse(req.body);
    if (dados.horaAbertura && dados.horaFechamento && dados.horaFechamento <= dados.horaAbertura) {
      throw new RequisicaoInvalidaError("horaFechamento deve ser depois de horaAbertura");
    }
    if (dados.horariosFixos !== undefined) {
      const [atual] = await db
        .select({ horaAbertura: regrasHorario.horaAbertura, horaFechamento: regrasHorario.horaFechamento })
        .from(regrasHorario)
        .where(and(eq(regrasHorario.id, req.params.regraId), eq(regrasHorario.unidadeId, req.unidadeId!)))
        .limit(1);
      if (!atual) throw new RecursoNaoEncontradoError("Regra de horario nao encontrada");
      validarHorariosFixosDentroDaJanela(
        dados.horariosFixos,
        dados.horaAbertura ?? atual.horaAbertura,
        dados.horaFechamento ?? atual.horaFechamento,
      );
    }
    let regra;
    try {
      [regra] = await db
        .update(regrasHorario)
        .set(dados)
        .where(and(eq(regrasHorario.id, req.params.regraId), eq(regrasHorario.unidadeId, req.unidadeId!)))
        .returning();
    } catch (err) {
      if (codigoDoErroPostgres(err) === PG_CHECK_VIOLATION) {
        throw new RequisicaoInvalidaError("Informe o valor do deposito antes de exigi-lo neste turno");
      }
      throw err;
    }
    if (!regra) throw new RecursoNaoEncontradoError("Regra de horario nao encontrada");
    res.json(regra);
  }),
);

regrasHorarioRouter.delete(
  "/:regraId",
  asyncHandler(async (req, res) => {
    const [regra] = await db
      .delete(regrasHorario)
      .where(and(eq(regrasHorario.id, req.params.regraId), eq(regrasHorario.unidadeId, req.unidadeId!)))
      .returning();
    if (!regra) throw new RecursoNaoEncontradoError("Regra de horario nao encontrada");
    res.status(204).send();
  }),
);
