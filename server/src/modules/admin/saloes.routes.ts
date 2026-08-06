import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { saloes } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { RecursoNaoEncontradoError } from "../../lib/errors.js";

export const saloesRouter = Router({ mergeParams: true });

const modoConfiguracaoSchema = z.enum(["simples", "mapa"]);

const criarSalaoSchema = z.object({
  nome: z.string().min(1),
  modoConfiguracao: modoConfiguracaoSchema.optional(),
  capacidadeTotal: z.number().int().positive().optional(),
});
const atualizarSalaoSchema = criarSalaoSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Informe ao menos um campo para atualizar");

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
    const [salao] = await db.insert(saloes).values({ unidadeId: req.unidadeId!, ...dados }).returning();
    res.status(201).json(salao);
  }),
);

saloesRouter.patch(
  "/:salaoId",
  asyncHandler(async (req, res) => {
    const dados = atualizarSalaoSchema.parse(req.body);
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
    const [salao] = await db
      .delete(saloes)
      .where(and(eq(saloes.id, req.params.salaoId), eq(saloes.unidadeId, req.unidadeId!)))
      .returning();
    if (!salao) throw new RecursoNaoEncontradoError("Salao nao encontrado");
    res.status(204).send();
  }),
);
