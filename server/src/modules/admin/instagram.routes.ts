import { Router } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { instagramConnections } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { reprocessarDirectsSemResposta } from "../agent/reprocessar-pendentes.js";

export const instagramRouter = Router();

// So o status/handle da conexao de nivel da empresa (nunca o access_token_encrypted) -
// usado pelo botao "Conectar Instagram"/"Reconectar" na config do agente (doc 14).
instagramRouter.get(
  "/connection",
  asyncHandler(async (req, res) => {
    const [conexao] = await db
      .select({
        id: instagramConnections.id,
        igBusinessAccountId: instagramConnections.igBusinessAccountId,
        handle: instagramConnections.handle,
        status: instagramConnections.status,
      })
      .from(instagramConnections)
      .where(and(eq(instagramConnections.empresaId, req.auth!.empresaId), isNull(instagramConnections.unidadeId)))
      .orderBy(desc(instagramConnections.id))
      .limit(1);

    res.json({ conectado: !!conexao, ...conexao });
  }),
);

// Responde directs que ficaram sem resposta por uma instabilidade (banco fora, token
// expirado) - ver reprocessar-pendentes.ts. dryRun=true so lista o que seria feito.
instagramRouter.post(
  "/reprocessar-pendentes",
  asyncHandler(async (req, res) => {
    const dryRun = req.body?.dryRun === true;
    const resultados = await reprocessarDirectsSemResposta(db, req.auth!.empresaId, { dryRun });
    res.json({ dryRun, resultados });
  }),
);
