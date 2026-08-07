import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { pesquisaPerguntas } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { RecursoNaoEncontradoError } from "../../lib/errors.js";

// NPS customizavel (doc 21) - perguntas que substituem a pesquisa fixa de nota+
// comentario livre (doc 16) quando a empresa configura pelo menos uma. So owner (mesmo
// nivel de config estrutural de whatsappRouter /config, ver index.ts).
export const pesquisaRouter = Router();

const criarPerguntaSchema = z.object({
  tipo: z.enum(["escala", "texto_curto"]),
  texto: z.string().min(1),
  ordem: z.number().int().optional(),
  ativa: z.boolean().optional(),
});

const atualizarPerguntaSchema = criarPerguntaSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Informe ao menos um campo para atualizar");

pesquisaRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const lista = await db
      .select()
      .from(pesquisaPerguntas)
      .where(eq(pesquisaPerguntas.empresaId, req.auth!.empresaId))
      .orderBy(pesquisaPerguntas.ordem);
    res.json(lista);
  }),
);

pesquisaRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const dados = criarPerguntaSchema.parse(req.body);
    const [pergunta] = await db
      .insert(pesquisaPerguntas)
      .values({ empresaId: req.auth!.empresaId, ...dados })
      .returning();
    res.status(201).json(pergunta);
  }),
);

pesquisaRouter.patch(
  "/:perguntaId",
  asyncHandler(async (req, res) => {
    const dados = atualizarPerguntaSchema.parse(req.body);
    const [pergunta] = await db
      .update(pesquisaPerguntas)
      .set(dados)
      .where(and(eq(pesquisaPerguntas.id, req.params.perguntaId), eq(pesquisaPerguntas.empresaId, req.auth!.empresaId)))
      .returning();
    if (!pergunta) throw new RecursoNaoEncontradoError("Pergunta nao encontrada");
    res.json(pergunta);
  }),
);

pesquisaRouter.delete(
  "/:perguntaId",
  asyncHandler(async (req, res) => {
    const [pergunta] = await db
      .delete(pesquisaPerguntas)
      .where(and(eq(pesquisaPerguntas.id, req.params.perguntaId), eq(pesquisaPerguntas.empresaId, req.auth!.empresaId)))
      .returning();
    if (!pergunta) throw new RecursoNaoEncontradoError("Pergunta nao encontrada");
    res.status(204).send();
  }),
);
