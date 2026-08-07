import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { assinaturas } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { obterStripe } from "../../lib/stripe.js";
import { cancelarAssinaturaDoTrial } from "../../lib/checkout.js";

export const assinaturaRouter = Router();

assinaturaRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const [assinatura] = await db.select().from(assinaturas).where(eq(assinaturas.empresaId, req.auth!.empresaId)).limit(1);
    res.json(assinatura ?? null);
  }),
);

assinaturaRouter.post(
  "/cancelar",
  asyncHandler(async (req, res) => {
    const atualizada = await cancelarAssinaturaDoTrial(db, obterStripe, req.auth!.empresaId);
    res.json(atualizada);
  }),
);
