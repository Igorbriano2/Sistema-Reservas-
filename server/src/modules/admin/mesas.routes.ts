import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { mesaFormatoEnum, mesas, saloes } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { RecursoNaoEncontradoError, RequisicaoInvalidaError } from "../../lib/errors.js";

export const mesasRouter = Router({ mergeParams: true });

const formatoSchema = z.enum(mesaFormatoEnum.enumValues);

const criarMesaSchema = z.object({
  salaoId: z.string().uuid(),
  nome: z.string().min(1),
  capacidadeMin: z.number().int().positive(),
  capacidadeMax: z.number().int().positive(),
  formato: formatoSchema.optional(),
  combinavelCom: z.array(z.string().uuid()).optional(),
  // Posicao/tamanho no editor visual (doc 11) - opcionais pra nao quebrar nenhum
  // outro fluxo que ainda cria mesa sem passar por la.
  posX: z.number().optional(),
  posY: z.number().optional(),
  largura: z.number().positive().optional(),
  altura: z.number().positive().optional(),
});

const atualizarMesaSchema = criarMesaSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Informe ao menos um campo para atualizar");

async function validarSalaoDaUnidade(salaoId: string, unidadeId: string): Promise<void> {
  const [salao] = await db
    .select({ id: saloes.id })
    .from(saloes)
    .where(and(eq(saloes.id, salaoId), eq(saloes.unidadeId, unidadeId)))
    .limit(1);
  if (!salao) throw new RequisicaoInvalidaError("Salao nao encontrado nesta unidade");
}

mesasRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const lista = await db
      .select({
        id: mesas.id,
        salaoId: mesas.salaoId,
        nome: mesas.nome,
        capacidadeMin: mesas.capacidadeMin,
        capacidadeMax: mesas.capacidadeMax,
        formato: mesas.formato,
        combinavelCom: mesas.combinavelCom,
        posX: mesas.posX,
        posY: mesas.posY,
        largura: mesas.largura,
        altura: mesas.altura,
      })
      .from(mesas)
      .innerJoin(saloes, eq(mesas.salaoId, saloes.id))
      .where(eq(saloes.unidadeId, req.unidadeId!));
    res.json(lista);
  }),
);

mesasRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const dados = criarMesaSchema.parse(req.body);
    if (dados.capacidadeMax < dados.capacidadeMin) {
      throw new RequisicaoInvalidaError("capacidadeMax deve ser >= capacidadeMin");
    }
    await validarSalaoDaUnidade(dados.salaoId, req.unidadeId!);

    const [mesa] = await db.insert(mesas).values(dados).returning();
    res.status(201).json(mesa);
  }),
);

mesasRouter.patch(
  "/:mesaId",
  asyncHandler(async (req, res) => {
    const dados = atualizarMesaSchema.parse(req.body);
    if (dados.salaoId) {
      await validarSalaoDaUnidade(dados.salaoId, req.unidadeId!);
    }

    // Garante que a mesa (antes de alterar) ja pertence a unidade autenticada.
    const [mesaAtual] = await db
      .select({ id: mesas.id })
      .from(mesas)
      .innerJoin(saloes, eq(mesas.salaoId, saloes.id))
      .where(and(eq(mesas.id, req.params.mesaId), eq(saloes.unidadeId, req.unidadeId!)))
      .limit(1);
    if (!mesaAtual) throw new RecursoNaoEncontradoError("Mesa nao encontrada");

    const [mesa] = await db.update(mesas).set(dados).where(eq(mesas.id, req.params.mesaId)).returning();
    res.json(mesa);
  }),
);

mesasRouter.delete(
  "/:mesaId",
  asyncHandler(async (req, res) => {
    const [mesaAtual] = await db
      .select({ id: mesas.id })
      .from(mesas)
      .innerJoin(saloes, eq(mesas.salaoId, saloes.id))
      .where(and(eq(mesas.id, req.params.mesaId), eq(saloes.unidadeId, req.unidadeId!)))
      .limit(1);
    if (!mesaAtual) throw new RecursoNaoEncontradoError("Mesa nao encontrada");

    await db.delete(mesas).where(eq(mesas.id, req.params.mesaId));
    res.status(204).send();
  }),
);
