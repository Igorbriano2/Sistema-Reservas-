import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { cardapioCategorias, cardapioItens, unidades } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { RecursoNaoEncontradoError } from "../../lib/errors.js";

// Rota PUBLICA (sem requireAuth, sem token assinado) - pensada pra QR code na mesa:
// o cardapio em si nao e informacao sensivel, so precisa do id da unidade (mesmo
// padrao de exposicao de outras paginas publicas do restaurante). So mostra
// categoria/item ATIVOS - o dono usa o toggle "ativo" no painel pra tirar algo do ar
// sem apagar o cadastro (ex: item em falta no dia).
export const cardapioPublicRouter = Router();

cardapioPublicRouter.get(
  "/:unidadeId",
  asyncHandler(async (req, res) => {
    const [unidade] = await db
      .select({ id: unidades.id, nome: unidades.nome })
      .from(unidades)
      .where(eq(unidades.id, req.params.unidadeId))
      .limit(1);
    if (!unidade) throw new RecursoNaoEncontradoError("Unidade nao encontrada");

    const categoriasAtivas = (
      await db
        .select({ id: cardapioCategorias.id, nome: cardapioCategorias.nome, ordem: cardapioCategorias.ordem })
        .from(cardapioCategorias)
        .where(and(eq(cardapioCategorias.unidadeId, unidade.id), eq(cardapioCategorias.ativo, true)))
    ).sort((a, b) => a.ordem - b.ordem);

    const itens =
      categoriasAtivas.length === 0
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
            })
            .from(cardapioItens)
            .innerJoin(cardapioCategorias, eq(cardapioItens.categoriaId, cardapioCategorias.id))
            .where(and(eq(cardapioCategorias.unidadeId, unidade.id), eq(cardapioItens.ativo, true)));

    res.json({
      unidadeNome: unidade.nome,
      categorias: categoriasAtivas.map((categoria) => ({
        id: categoria.id,
        nome: categoria.nome,
        itens: itens
          .filter((item) => item.categoriaId === categoria.id)
          .sort((a, b) => a.ordem - b.ordem)
          .map(({ categoriaId: _categoriaId, ordem: _ordem, ...item }) => item),
      })),
    });
  }),
);

// Doc 32 - serve os bytes de uma imagem de item enviada por upload (armazenada em
// base64 no proprio Postgres, ver imagemUrl/imagemDados em db/schema/cardapio.ts).
// Publica igual ao resto do cardapio: a foto do produto nao e informacao sensivel.
cardapioPublicRouter.get(
  "/imagem/:itemId",
  asyncHandler(async (req, res) => {
    const [item] = await db
      .select({ imagemDados: cardapioItens.imagemDados, imagemMimeType: cardapioItens.imagemMimeType })
      .from(cardapioItens)
      .where(eq(cardapioItens.id, req.params.itemId))
      .limit(1);
    if (!item || !item.imagemDados || !item.imagemMimeType) throw new RecursoNaoEncontradoError("Imagem nao encontrada");

    res.set("Content-Type", item.imagemMimeType);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(Buffer.from(item.imagemDados, "base64"));
  }),
);
