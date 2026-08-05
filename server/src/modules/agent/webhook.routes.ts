import { Router } from "express";
import { db } from "../../db/client.js";
import { env } from "../../config/env.js";
import { verificarAssinaturaDoWebhook } from "../../lib/instagram-api.js";
import { processarEventoDoInstagram, type InstagramMessagingEvent } from "./process-event.js";

export const webhookRouter = Router();

// Handshake de verificacao exigido pela Meta ao registrar o webhook no App Dashboard.
webhookRouter.get("/", (req, res) => {
  const modo = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (modo === "subscribe" && env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN && token === env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(String(challenge ?? ""));
    return;
  }
  res.sendStatus(403);
});

webhookRouter.post("/", (req, res) => {
  const assinatura = req.header("x-hub-signature-256");
  if (!verificarAssinaturaDoWebhook(req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {})), assinatura)) {
    res.sendStatus(401);
    return;
  }

  // Processa sincronamente e so entao responde 200: mais simples que uma fila/worker
  // separado, aceitavel para o volume esperado do MVP. Cada evento roda isolado
  // (allSettled) para um erro num evento nao derrubar os demais nem a resposta ao webhook.
  const entradas: Array<{ messaging?: InstagramMessagingEvent[] }> = req.body?.entry ?? [];
  const eventos = entradas.flatMap((entrada) => entrada.messaging ?? []);

  Promise.allSettled(eventos.map((evento) => processarEventoDoInstagram(db, evento)))
    .then((resultados) => {
      for (const resultado of resultados) {
        if (resultado.status === "rejected") {
          console.error("[webhook] Erro ao processar evento do Instagram:", resultado.reason);
        }
      }
    })
    .finally(() => res.sendStatus(200));
});
