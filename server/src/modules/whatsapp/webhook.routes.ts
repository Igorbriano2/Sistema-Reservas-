import { Router } from "express";
import { db } from "../../db/client.js";
import { env } from "../../config/env.js";
import { verificarAssinaturaDoWebhookWhatsapp } from "../../lib/whatsapp-api.js";
import { processarEventoDoWhatsapp, type WhatsappChangeValue } from "./process-whatsapp-event.js";

export const whatsappWebhookRouter = Router();

interface WhatsappChange {
  value?: WhatsappChangeValue;
  field?: string;
}

// Handshake de verificacao exigido pela Meta ao registrar o webhook no App Dashboard
// (mesmo esquema do webhook do Instagram).
whatsappWebhookRouter.get("/", (req, res) => {
  const modo = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (modo === "subscribe" && env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(String(challenge ?? ""));
    return;
  }
  res.sendStatus(403);
});

whatsappWebhookRouter.post("/", (req, res) => {
  const assinatura = req.header("x-hub-signature-256");
  if (!verificarAssinaturaDoWebhookWhatsapp(req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {})), assinatura)) {
    res.sendStatus(401);
    return;
  }

  // So o campo "messages" interessa aqui (a Cloud API tambem manda "field":"statuses"
  // pra confirmacoes de entrega/leitura, que este endpoint ignora). Cada evento roda
  // isolado (allSettled) - um erro nao derruba os demais nem a resposta 200 ao
  // webhook (a Meta desativa o webhook depois de respostas nao-200 repetidas).
  const entradas: Array<{ changes?: WhatsappChange[] }> = req.body?.entry ?? [];
  const valores = entradas
    .flatMap((entrada) => entrada.changes ?? [])
    .filter((mudanca) => mudanca.field === "messages" && mudanca.value)
    .map((mudanca) => mudanca.value!);

  Promise.allSettled(valores.map((valor) => processarEventoDoWhatsapp(db, valor)))
    .then((resultados) => {
      for (const resultado of resultados) {
        if (resultado.status === "rejected") {
          console.error("[whatsapp-webhook] Erro ao processar evento:", resultado.reason);
        }
      }
    })
    .finally(() => res.sendStatus(200));
});
