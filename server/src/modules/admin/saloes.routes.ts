import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { saloes } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { RecursoNaoEncontradoError } from "../../lib/errors.js";

export const saloesRouter = Router({ mergeParams: true });

const criarSalaoSchema = z.object({ nome: z.string().min(1) });
const atualizarSalaoSchema = z.object({ nome: z.string().min(1) });

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
    const { nome } = criarSalaoSchema.parse(req.body);
    const [salao] = await db.insert(saloes).values({ unidadeId: req.unidadeId!, nome }).returning();
    res.status(201).json(salao);
  }),
);

saloesRouter.patch(
  "/:salaoId",
  asyncHandler(async (req, res) => {
    const { nome } = atualizarSalaoSchema.parse(req.body);
    const [salao] = await db
      .update(saloes)
      .set({ nome })
      .where(and(eq(saloes.id, req.params.salaoId), eq(saloes.unidadeId, req.unidadeId!)))
      .returning();
    if (!salao) throw new RecursoNaoEncontradoError("Salao nao encontrado");
    res.json(salao);
  }),
);

saloesRouter.delete(
  "/:salaoId",
  asyncHandler(async (req, res) => {
    const [salao] = await db
      .delete(saloes)
      .where(and(eq(saloes.id, req.params.salaoId), eq(saloes.unidadeId, req.unidadeId!)))
      .returning();
    if (!salao) throw new RecursoNaoEncontradoError("Salao nao encontrado");
    res.status(204).send();
  }),
);
