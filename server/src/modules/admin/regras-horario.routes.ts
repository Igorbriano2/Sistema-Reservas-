import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { regrasHorario } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { RecursoNaoEncontradoError, RequisicaoInvalidaError } from "../../lib/errors.js";

export const regrasHorarioRouter = Router({ mergeParams: true });

const horaSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use o formato HH:MM");

const criarRegraSchema = z.object({
  diaSemana: z.number().int().min(0).max(6),
  horaAbertura: horaSchema,
  horaFechamento: horaSchema,
  duracaoPadraoMin: z.number().int().positive().optional(),
  bufferMin: z.number().int().min(0).optional(),
});

const atualizarRegraSchema = criarRegraSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Informe ao menos um campo para atualizar");

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
    const [regra] = await db
      .insert(regrasHorario)
      .values({ unidadeId: req.unidadeId!, ...dados })
      .returning();
    res.status(201).json(regra);
  }),
);

regrasHorarioRouter.patch(
  "/:regraId",
  asyncHandler(async (req, res) => {
    const dados = atualizarRegraSchema.parse(req.body);
    if (dados.horaAbertura && dados.horaFechamento && dados.horaFechamento <= dados.horaAbertura) {
      throw new RequisicaoInvalidaError("horaFechamento deve ser depois de horaAbertura");
    }
    const [regra] = await db
      .update(regrasHorario)
      .set(dados)
      .where(and(eq(regrasHorario.id, req.params.regraId), eq(regrasHorario.unidadeId, req.unidadeId!)))
      .returning();
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
