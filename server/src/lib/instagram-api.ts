import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

const GRAPH_API_VERSION = "v21.0";

// Confere X-Hub-Signature-256 do webhook contra o INSTAGRAM_APP_SECRET. Sem app
// secret configurado (dev local sem esse valor definido) a verificacao e pulada -
// nunca deixe isso acontecer em producao (ver aviso em server.ts).
export function verificarAssinaturaDoWebhook(payloadCru: Buffer, assinaturaRecebida: string | undefined): boolean {
  if (!env.INSTAGRAM_APP_SECRET) {
    return true;
  }
  if (!assinaturaRecebida) {
    return false;
  }

  const esperado = `sha256=${createHmac("sha256", env.INSTAGRAM_APP_SECRET).update(payloadCru).digest("hex")}`;
  const bufEsperado = Buffer.from(esperado);
  const bufRecebido = Buffer.from(assinaturaRecebida);
  if (bufEsperado.length !== bufRecebido.length) {
    return false;
  }
  return timingSafeEqual(bufEsperado, bufRecebido);
}

// Retorna o mid (ID da mensagem) atribuido pelo Instagram, usado para deduplicar
// reentregas do webhook e distinguir echo do proprio agente de resposta humana.
export async function enviarMensagemInstagram(accessToken: string, igSenderId: string, texto: string): Promise<string> {
  const resposta = await fetch(`https://graph.instagram.com/${GRAPH_API_VERSION}/me/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ recipient: { id: igSenderId }, message: { text: texto } }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`Falha ao enviar mensagem no Instagram (${resposta.status}): ${corpo}`);
  }

  const dados = (await resposta.json()) as { message_id?: string };
  return dados.message_id ?? "";
}
