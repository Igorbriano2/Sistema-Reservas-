import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { cardapioCategorias, cardapioItens } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { RecursoNaoEncontradoError } from "../../lib/errors.js";
import { validarCategoriaDaUnidade } from "../../lib/cardapio-helpers.js";

export const cardapioRouter = Router({ mergeParams: true });

const criarCategoriaSchema = z.object({
  nome: z.string().min(1),
  ordem: z.number().int().optional(),
  ativo: z.boolean().optional(),
});
const atualizarCategoriaSchema = criarCategoriaSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Informe ao menos um campo para atualizar");

const criarItemSchema = z.object({
  categoriaId: z.string().uuid(),
  nome: z.string().min(1),
  descricao: z.string().optional(),
  precoCentavos: z.number().int().nonnegative(),
  imagemUrl: z.string().url().optional(),
  porcaoServePessoas: z.number().int().positive().optional(),
  somenteMaiorIdade: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  ordem: z.number().int().optional(),
  ativo: z.boolean().optional(),
});
const atualizarItemSchema = criarItemSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Informe ao menos um campo para atualizar");

// Categorias com os proprios itens aninhados - formato pronto pro admin renderizar
// o cardapio inteiro numa unica chamada (sem N+1 de tela).
cardapioRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const categorias = await db
      .select()
      .from(cardapioCategorias)
      .where(eq(cardapioCategorias.unidadeId, req.unidadeId!));

    const itens =
      categorias.length === 0
        ? []
        : await db
            .select({
              id: cardapioItens.id,
              categoriaId: cardapioItens.categoriaId,
              nome: cardapioItens.nome,
              descricao: cardapioItens.descricao,
              precoCentavos: cardapioItens.precoCentavos,
              imagemUrl: cardapioItens.imagemUrl,
              porcaoServePessoas: cardapioItens.porcaoServePessoas,
              somenteMaiorIdade: cardapioItens.somenteMaiorIdade,
              tags: cardapioItens.tags,
              ordem: cardapioItens.ordem,
              ativo: cardapioItens.ativo,
            })
            .from(cardapioItens)
            .innerJoin(cardapioCategorias, eq(cardapioItens.categoriaId, cardapioCategorias.id))
            .where(eq(cardapioCategorias.unidadeId, req.unidadeId!));

    res.json(
      categorias.map((categoria) => ({
        ...categoria,
        itens: itens.filter((item) => item.categoriaId === categoria.id),
      })),
    );
  }),
);

cardapioRouter.post(
  "/categorias",
  asyncHandler(async (req, res) => {
    const dados = criarCategoriaSchema.parse(req.body);
    const [categoria] = await db
      .insert(cardapioCategorias)
      .values({ unidadeId: req.unidadeId!, ...dados })
      .returning();
    res.status(201).json(categoria);
  }),
);

cardapioRouter.patch(
  "/categorias/:categoriaId",
  asyncHandler(async (req, res) => {
    const dados = atualizarCategoriaSchema.parse(req.body);
    const [categoria] = await db
      .update(cardapioCategorias)
      .set(dados)
      .where(and(eq(cardapioCategorias.id, req.params.categoriaId), eq(cardapioCategorias.unidadeId, req.unidadeId!)))
      .returning();
    if (!categoria) throw new RecursoNaoEncontradoError("Categoria nao encontrada");
    res.json(categoria);
  }),
);

cardapioRouter.delete(
  "/categorias/:categoriaId",
  asyncHandler(async (req, res) => {
    const [categoria] = await db
      .delete(cardapioCategorias)
      .where(and(eq(cardapioCategorias.id, req.params.categoriaId), eq(cardapioCategorias.unidadeId, req.unidadeId!)))
      .returning();
    if (!categoria) throw new RecursoNaoEncontradoError("Categoria nao encontrada");
    res.status(204).send();
  }),
);

cardapioRouter.post(
  "/itens",
  asyncHandler(async (req, res) => {
    const dados = criarItemSchema.parse(req.body);
    await validarCategoriaDaUnidade(dados.categoriaId, req.unidadeId!);

    const [item] = await db.insert(cardapioItens).values(dados).returning();
    res.status(201).json(item);
  }),
);

cardapioRouter.patch(
  "/itens/:itemId",
  asyncHandler(async (req, res) => {
    const dados = atualizarItemSchema.parse(req.body);
    if (dados.categoriaId) {
      await validarCategoriaDaUnidade(dados.categoriaId, req.unidadeId!);
    }

    const [itemAtual] = await db
      .select({ id: cardapioItens.id })
      .from(cardapioItens)
      .innerJoin(cardapioCategorias, eq(cardapioItens.categoriaId, cardapioCategorias.id))
      .where(and(eq(cardapioItens.id, req.params.itemId), eq(cardapioCategorias.unidadeId, req.unidadeId!)))
      .limit(1);
    if (!itemAtual) throw new RecursoNaoEncontradoError("Item nao encontrado");

    const [item] = await db.update(cardapioItens).set(dados).where(eq(cardapioItens.id, req.params.itemId)).returning();
    res.json(item);
  }),
);

cardapioRouter.delete(
  "/itens/:itemId",
  asyncHandler(async (req, res) => {
    const [itemAtual] = await db
      .select({ id: cardapioItens.id })
      .from(cardapioItens)
      .innerJoin(cardapioCategorias, eq(cardapioItens.categoriaId, cardapioCategorias.id))
      .where(and(eq(cardapioItens.id, req.params.itemId), eq(cardapioCategorias.unidadeId, req.unidadeId!)))
      .limit(1);
    if (!itemAtual) throw new RecursoNaoEncontradoError("Item nao encontrado");

    await db.delete(cardapioItens).where(eq(cardapioItens.id, req.params.itemId));
    res.status(204).send();
  }),
);
