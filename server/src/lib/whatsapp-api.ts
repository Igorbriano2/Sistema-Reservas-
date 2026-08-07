import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

// Confere X-Hub-Signature-256 do webhook contra o WHATSAPP_APP_SECRET - mesmo
// esquema do Instagram (ver instagram-api.ts). Sem app secret configurado a
// verificacao e pulada (dev local); nunca deixe isso acontecer em producao.
export function verificarAssinaturaDoWebhookWhatsapp(payloadCru: Buffer, assinaturaRecebida: string | undefined): boolean {
  if (!env.WHATSAPP_APP_SECRET) {
    return true;
  }
  if (!assinaturaRecebida) {
    return false;
  }

  const esperado = `sha256=${createHmac("sha256", env.WHATSAPP_APP_SECRET).update(payloadCru).digest("hex")}`;
  const bufEsperado = Buffer.from(esperado);
  const bufRecebido = Buffer.from(assinaturaRecebida);
  if (bufEsperado.length !== bufRecebido.length) {
    return false;
  }
  return timingSafeEqual(bufEsperado, bufRecebido);
}

export interface ComponenteTemplate {
  type: "body" | "header" | "button";
  parameters: Array<{ type: "text"; text: string }>;
}

// Envia uma mensagem de TEMPLATE pre-aprovado (obrigatorio pra qualquer mensagem que
// o sistema inicia por conta propria - diferente do agente do Instagram, que so
// responde). nomeDoTemplate/idioma vem sempre de configuracao (env/whatsapp_config),
// nunca hardcoded aqui.
export async function enviarTemplateWhatsapp(params: {
  accessToken: string;
  phoneNumberId: string;
  telefoneDestino: string;
  nomeDoTemplate: string;
  idioma: string;
  componentes?: ComponenteTemplate[];
}): Promise<string> {
  const resposta = await fetch(`https://graph.facebook.com/${env.WHATSAPP_GRAPH_API_VERSION}/${params.phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${params.accessToken}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: params.telefoneDestino,
      type: "template",
      template: {
        name: params.nomeDoTemplate,
        language: { code: params.idioma },
        components: params.componentes ?? [],
      },
    }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`Falha ao enviar template do WhatsApp (${resposta.status}): ${corpo}`);
  }

  const dados = (await resposta.json()) as { messages?: Array<{ id?: string }> };
  return dados.messages?.[0]?.id ?? "";
}
