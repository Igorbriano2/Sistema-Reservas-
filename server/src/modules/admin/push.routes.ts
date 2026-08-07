import { Router } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { pushSubscricoes } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { env } from "../../config/env.js";

export const pushRouter = Router({ mergeParams: true });

const subscricaoSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

// Chave publica VAPID pra o frontend chamar pushManager.subscribe() - nao e segredo
// (e a metade publica do par), mas fica atras de auth como o resto do /admin so pra
// nao expor sem necessidade.
pushRouter.get(
  "/chave-publica",
  asyncHandler(async (_req, res) => {
    res.json({ chavePublica: env.VAPID_PUBLIC_KEY ?? null });
  }),
);

// Owner e funcionario podem inscrever o proprio dispositivo (qualquer um na portaria
// pode querer receber as notificacoes).
pushRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const dados = subscricaoSchema.parse(req.body);
    // Upsert por endpoint: o navegador pode reenviar a mesma subscription (ex: apos
    // reinstalar o PWA), e um mesmo endpoint nunca pertence a duas unidades.
    await db
      .insert(pushSubscricoes)
      .values({ unidadeId: req.unidadeId!, endpoint: dados.endpoint, p256dh: dados.keys.p256dh, auth: dados.keys.auth })
      .onConflictDoUpdate({
        target: pushSubscricoes.endpoint,
        set: { unidadeId: req.unidadeId!, p256dh: dados.keys.p256dh, auth: dados.keys.auth },
      });
    res.status(201).json({ inscrito: true });
  }),
);

pushRouter.delete(
  "/",
  asyncHandler(async (req, res) => {
    const { endpoint } = z.object({ endpoint: z.string().url() }).parse(req.query);
    await db
      .delete(pushSubscricoes)
      .where(and(eq(pushSubscricoes.unidadeId, req.unidadeId!), eq(pushSubscricoes.endpoint, endpoint)));
    res.status(204).send();
  }),
);
