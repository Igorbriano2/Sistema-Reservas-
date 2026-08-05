import { Router } from "express";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { conversas, mensagens } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { RecursoNaoEncontradoError } from "../../lib/errors.js";

export const conversasRouter = Router({ mergeParams: true });

conversasRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const lista = await db.select().from(conversas).where(eq(conversas.unidadeId, req.unidadeId!));
    res.json(lista);
  }),
);

conversasRouter.get(
  "/:conversaId/mensagens",
  asyncHandler(async (req, res) => {
    const [conversa] = await db
      .select({ id: conversas.id })
      .from(conversas)
      .where(and(eq(conversas.id, req.params.conversaId), eq(conversas.unidadeId, req.unidadeId!)))
      .limit(1);
    if (!conversa) throw new RecursoNaoEncontradoError("Conversa nao encontrada");

    const lista = await db
      .select()
      .from(mensagens)
      .where(eq(mensagens.conversaId, conversa.id))
      .orderBy(asc(mensagens.criadoEm));
    res.json(lista);
  }),
);

const atualizarConversaSchema = z.object({ agentPaused: z.boolean() });

// Fecha o loop de "pausar respostas automaticas ate reativacao manual": o dono do
// restaurante reativa o agente por aqui depois de assumir uma conversa pela Meta
// Business Suite (ou pausa manualmente, se quiser assumir sem esperar o cliente escrever).
conversasRouter.patch(
  "/:conversaId",
  asyncHandler(async (req, res) => {
    const { agentPaused } = atualizarConversaSchema.parse(req.body);
    const [conversa] = await db
      .update(conversas)
      .set({ agentPaused })
      .where(and(eq(conversas.id, req.params.conversaId), eq(conversas.unidadeId, req.unidadeId!)))
      .returning();
    if (!conversa) throw new RecursoNaoEncontradoError("Conversa nao encontrada");
    res.json(conversa);
  }),
);
