import { Router } from "express";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { excecoesHorario } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { RecursoNaoEncontradoError, RequisicaoInvalidaError } from "../../lib/errors.js";

export const excecoesHorarioRouter = Router({ mergeParams: true });

const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data deve estar no formato YYYY-MM-DD");
const horaSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use o formato HH:MM");

// Feriados/datas especiais (doc 26): cada linha marca uma data como "diferente" pra
// esta unidade - fechamento pontual, horario excepcional, e/ou (mesmo quando aberta
// normalmente) uma data que lib/feriados.ts passa a contar como feriado municipal pro
// calculo do valor do rodizio. Nao precisa marcar fechado=true so pra isso contar
// como feriado - a maioria dos feriados municipais sao dias de MAIS movimento, nao
// de fechamento.
const criarExcecaoSchema = z
  .object({
    data: dataSchema,
    nome: z.string().trim().min(1).max(80).optional(),
    fechado: z.boolean().optional(),
    horaAbertura: horaSchema.optional(),
    horaFechamento: horaSchema.optional(),
  })
  .refine((d) => !d.horaAbertura || !d.horaFechamento || d.horaFechamento > d.horaAbertura, {
    message: "horaFechamento deve ser depois de horaAbertura",
  });

excecoesHorarioRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const lista = await db
      .select()
      .from(excecoesHorario)
      .where(eq(excecoesHorario.unidadeId, req.unidadeId!))
      .orderBy(asc(excecoesHorario.data));
    res.json(lista);
  }),
);

excecoesHorarioRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const dados = criarExcecaoSchema.parse(req.body);
    const [existente] = await db
      .select({ id: excecoesHorario.id })
      .from(excecoesHorario)
      .where(and(eq(excecoesHorario.unidadeId, req.unidadeId!), eq(excecoesHorario.data, dados.data)))
      .limit(1);
    if (existente) {
      throw new RequisicaoInvalidaError("Ja existe uma data especial cadastrada para este dia");
    }
    const [excecao] = await db
      .insert(excecoesHorario)
      .values({ unidadeId: req.unidadeId!, ...dados })
      .returning();
    res.status(201).json(excecao);
  }),
);

excecoesHorarioRouter.delete(
  "/:excecaoId",
  asyncHandler(async (req, res) => {
    const [excecao] = await db
      .delete(excecoesHorario)
      .where(and(eq(excecoesHorario.id, req.params.excecaoId), eq(excecoesHorario.unidadeId, req.unidadeId!)))
      .returning();
    if (!excecao) throw new RecursoNaoEncontradoError("Data especial nao encontrada");
    res.status(204).send();
  }),
);
