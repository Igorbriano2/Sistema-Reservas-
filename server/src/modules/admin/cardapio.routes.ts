import { Router } from "express";
import multer from "multer";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { cardapioCategorias, cardapioItens } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { RecursoNaoEncontradoError, RequisicaoInvalidaError } from "../../lib/errors.js";
import { validarCategoriaDaUnidade } from "../../lib/cardapio-helpers.js";

export const cardapioRouter = Router({ mergeParams: true });

// Doc 32 - upload autohospedado da foto do produto. Guarda em memoria (nao em disco:
// o App Platform e efemero e perderia o arquivo no proximo deploy) so pra converter
// pra base64 e gravar no Postgres logo em seguida. 3MB cobre uma foto de produto com
// folga sem deixar o payload/coluna descontrolado.
const TIPOS_IMAGEM_ACEITOS = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const uploadImagem = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!TIPOS_IMAGEM_ACEITOS.has(file.mimetype)) {
      cb(new RequisicaoInvalidaError("Formato de imagem nao suportado. Use JPG, PNG, WEBP ou GIF."));
      return;
    }
    cb(null, true);
  },
});

// "cardapio_itens" nao tem unidade_id direto (so categoria_id) - esta subquery deixa
// o UPDATE/DELETE abaixo filtrar por unidade no MESMO where do SELECT que ja confirma
// posse, em vez de confiar so no SELECT anterior pra depois mutar so por id (ver doc
// 25: mesmo padrao seguido em mesas.routes.ts e salao-elementos.routes.ts).
function categoriaIdsDaUnidade(unidadeId: string) {
  return db.select({ id: cardapioCategorias.id }).from(cardapioCategorias).where(eq(cardapioCategorias.unidadeId, unidadeId));
}

const criarCategoriaSchema = z.object({
  nome: z.string().min(1),
  ordem: z.number().int().optional(),
  ativo: z.boolean().optional(),
});
const atualizarCategoriaSchema = criarCategoriaSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Informe ao menos um campo para atualizar");

// imagemUrl NAO entra aqui de proposito (doc 33): so a rota de upload
// (POST /itens/:itemId/imagem) pode definir esse campo, gravando junto os bytes em
// imagemDados - assim nunca existe um item com imagemUrl apontando pra um link externo
// que a gente nao hospeda (o dono so pode subir uma foto de verdade, autohospedada).
const criarItemSchema = z.object({
  categoriaId: z.string().uuid(),
  nome: z.string().min(1),
  descricao: z.string().optional(),
  precoCentavos: z.number().int().nonnegative(),
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

    const [item] = await db
      .update(cardapioItens)
      .set(dados)
      .where(and(eq(cardapioItens.id, req.params.itemId), inArray(cardapioItens.categoriaId, categoriaIdsDaUnidade(req.unidadeId!))))
      .returning();
    if (!item) throw new RecursoNaoEncontradoError("Item nao encontrado");
    res.json(item);
  }),
);

// Doc 32 - upload da foto do produto: grava os bytes em base64 direto no Postgres e
// aponta imagemUrl pra rota publica que os serve (GET /public/cardapio/imagem/:itemId),
// construida a partir do host da propria requisicao (sem depender de env var nova, ja
// que API e web sao dois apps/dominios separados no App Platform).
cardapioRouter.post(
  "/itens/:itemId/imagem",
  uploadImagem.single("imagem"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new RequisicaoInvalidaError("Envie um arquivo de imagem no campo 'imagem'.");

    const [itemAtual] = await db
      .select({ id: cardapioItens.id })
      .from(cardapioItens)
      .innerJoin(cardapioCategorias, eq(cardapioItens.categoriaId, cardapioCategorias.id))
      .where(and(eq(cardapioItens.id, req.params.itemId), eq(cardapioCategorias.unidadeId, req.unidadeId!)))
      .limit(1);
    if (!itemAtual) throw new RecursoNaoEncontradoError("Item nao encontrado");

    const imagemUrl = `${req.protocol}://${req.get("host")}/public/cardapio/imagem/${req.params.itemId}`;
    const [item] = await db
      .update(cardapioItens)
      .set({
        imagemUrl,
        imagemDados: req.file.buffer.toString("base64"),
        imagemMimeType: req.file.mimetype,
      })
      .where(and(eq(cardapioItens.id, req.params.itemId), inArray(cardapioItens.categoriaId, categoriaIdsDaUnidade(req.unidadeId!))))
      .returning();
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

    const apagados = await db
      .delete(cardapioItens)
      .where(and(eq(cardapioItens.id, req.params.itemId), inArray(cardapioItens.categoriaId, categoriaIdsDaUnidade(req.unidadeId!))))
      .returning({ id: cardapioItens.id });
    if (apagados.length === 0) throw new RecursoNaoEncontradoError("Item nao encontrado");
    res.status(204).send();
  }),
);
