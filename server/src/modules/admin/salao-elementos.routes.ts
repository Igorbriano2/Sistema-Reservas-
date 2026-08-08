import { Router } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { salaoElementos, saloes, tipoElementoSalaoEnum } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { RecursoNaoEncontradoError } from "../../lib/errors.js";
import { validarSalaoDaUnidade } from "../../lib/salao-helpers.js";

export const salaoElementosRouter = Router({ mergeParams: true });

// "salao_elementos" nao tem unidade_id direto (so salao_id) - esta subquery deixa o
// UPDATE/DELETE abaixo filtrar por unidade no MESMO where do SELECT que ja confirma
// posse, em vez de confiar so no SELECT anterior pra depois mutar so por id (ver doc
// 25: mesmo padrao seguido em mesas.routes.ts e cardapio.routes.ts).
function salaoIdsDaUnidade(unidadeId: string) {
  return db.select({ id: saloes.id }).from(saloes).where(eq(saloes.unidadeId, unidadeId));
}

const tipoSchema = z.enum(tipoElementoSalaoEnum.enumValues);

const criarElementoSchema = z.object({
  salaoId: z.string().uuid(),
  tipo: tipoSchema,
  nome: z.string().min(1),
  posX: z.number(),
  posY: z.number(),
  largura: z.number().positive(),
  altura: z.number().positive(),
  rotacao: z.number().optional(),
  capacidade: z.number().int().positive().optional(),
});

const atualizarElementoSchema = criarElementoSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Informe ao menos um campo para atualizar");

salaoElementosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const lista = await db
      .select({
        id: salaoElementos.id,
        salaoId: salaoElementos.salaoId,
        tipo: salaoElementos.tipo,
        nome: salaoElementos.nome,
        posX: salaoElementos.posX,
        posY: salaoElementos.posY,
        largura: salaoElementos.largura,
        altura: salaoElementos.altura,
        rotacao: salaoElementos.rotacao,
        capacidade: salaoElementos.capacidade,
      })
      .from(salaoElementos)
      .innerJoin(saloes, eq(salaoElementos.salaoId, saloes.id))
      .where(eq(saloes.unidadeId, req.unidadeId!));
    res.json(lista);
  }),
);

salaoElementosRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const dados = criarElementoSchema.parse(req.body);
    await validarSalaoDaUnidade(dados.salaoId, req.unidadeId!);

    const [elemento] = await db.insert(salaoElementos).values(dados).returning();
    res.status(201).json(elemento);
  }),
);

salaoElementosRouter.patch(
  "/:elementoId",
  asyncHandler(async (req, res) => {
    const dados = atualizarElementoSchema.parse(req.body);
    if (dados.salaoId) {
      await validarSalaoDaUnidade(dados.salaoId, req.unidadeId!);
    }

    const [elementoAtual] = await db
      .select({ id: salaoElementos.id })
      .from(salaoElementos)
      .innerJoin(saloes, eq(salaoElementos.salaoId, saloes.id))
      .where(and(eq(salaoElementos.id, req.params.elementoId), eq(saloes.unidadeId, req.unidadeId!)))
      .limit(1);
    if (!elementoAtual) throw new RecursoNaoEncontradoError("Elemento nao encontrado");

    const [elemento] = await db
      .update(salaoElementos)
      .set(dados)
      .where(and(eq(salaoElementos.id, req.params.elementoId), inArray(salaoElementos.salaoId, salaoIdsDaUnidade(req.unidadeId!))))
      .returning();
    if (!elemento) throw new RecursoNaoEncontradoError("Elemento nao encontrado");
    res.json(elemento);
  }),
);

salaoElementosRouter.delete(
  "/:elementoId",
  asyncHandler(async (req, res) => {
    const [elementoAtual] = await db
      .select({ id: salaoElementos.id })
      .from(salaoElementos)
      .innerJoin(saloes, eq(salaoElementos.salaoId, saloes.id))
      .where(and(eq(salaoElementos.id, req.params.elementoId), eq(saloes.unidadeId, req.unidadeId!)))
      .limit(1);
    if (!elementoAtual) throw new RecursoNaoEncontradoError("Elemento nao encontrado");

    const apagados = await db
      .delete(salaoElementos)
      .where(and(eq(salaoElementos.id, req.params.elementoId), inArray(salaoElementos.salaoId, salaoIdsDaUnidade(req.unidadeId!))))
      .returning({ id: salaoElementos.id });
    if (apagados.length === 0) throw new RecursoNaoEncontradoError("Elemento nao encontrado");
    res.status(204).send();
  }),
);
