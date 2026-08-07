import webpush from "web-push";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { pushSubscricoes } from "../db/schema/index.js";
import { env } from "../config/env.js";

let configurado = false;

function garantirConfigurado(): boolean {
  if (configurado) return true;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  configurado = true;
  return true;
}

interface NotificacaoPush {
  titulo: string;
  corpo: string;
  // Rota do painel pra abrir ao clicar na notificacao (ver sw.ts, evento notificationclick).
  url?: string;
}

function temStatusCode(err: unknown): err is { statusCode: number } {
  return typeof err === "object" && err !== null && "statusCode" in err;
}

// Envia pra todos os dispositivos inscritos da unidade (varios funcionarios podem
// estar com o PWA instalado ao mesmo tempo). Sem chaves VAPID configuradas (ambiente
// sem push habilitado), vira um no-op silencioso - nunca quebra o fluxo que chamou.
export async function enviarPushParaUnidade(db: Database, unidadeId: string, notificacao: NotificacaoPush): Promise<void> {
  if (!garantirConfigurado()) return;

  const inscricoes = await db.select().from(pushSubscricoes).where(eq(pushSubscricoes.unidadeId, unidadeId));
  if (inscricoes.length === 0) return;

  const payload = JSON.stringify(notificacao);

  await Promise.all(
    inscricoes.map(async (inscricao) => {
      try {
        await webpush.sendNotification(
          { endpoint: inscricao.endpoint, keys: { p256dh: inscricao.p256dh, auth: inscricao.auth } },
          payload,
        );
      } catch (err) {
        // 404/410 = subscription expirada ou revogada pelo navegador - remove pra nao
        // tentar de novo pra sempre. Qualquer outro erro so loga (rede instavel etc).
        if (temStatusCode(err) && (err.statusCode === 404 || err.statusCode === 410)) {
          await db.delete(pushSubscricoes).where(eq(pushSubscricoes.endpoint, inscricao.endpoint));
        } else {
          console.error("[push] falha ao enviar notificacao", err);
        }
      }
    }),
  );
}
