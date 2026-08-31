import { toFile } from "openai";
import { env } from "../config/env.js";
import { getOpenAiClient } from "./openai-client.js";

// Doc 42 - mensagem de voz recebida no Instagram: baixa o audio (a Meta so manda a
// URL no webhook, nunca o arquivo) e transcreve via Whisper da OpenAI. Sempre
// OpenAI, mesmo quando a Anthropic e a IA principal do texto (doc 39) - a Claude API
// nao aceita audio bruto como entrada, so a OpenAI oferece transcricao aqui. Devolve
// null (nunca lanca) em qualquer falha - quem chama decide o que fazer (process-event.ts
// pede pro cliente escrever em texto).
export async function transcreverAudioDoInstagram(url: string): Promise<string | null> {
  if (!env.OPENAI_API_KEY) {
    console.warn("[audio] OPENAI_API_KEY nao configurada - nao e possivel transcrever audio");
    return null;
  }

  try {
    const resposta = await fetch(url);
    if (!resposta.ok) {
      console.error(`[audio] falha ao baixar audio do Instagram (status ${resposta.status})`);
      return null;
    }
    const bytes = await resposta.arrayBuffer();
    const tipoDeConteudo = resposta.headers.get("content-type") ?? "audio/mp4";

    const openai = getOpenAiClient();
    const arquivo = await toFile(Buffer.from(bytes), "audio-instagram.m4a", { type: tipoDeConteudo });
    const transcricao = await openai.audio.transcriptions.create({
      file: arquivo,
      model: env.OPENAI_TRANSCRIPTION_MODEL,
    });

    const texto = transcricao.text?.trim();
    return texto || null;
  } catch (err) {
    console.error("[audio] erro ao transcrever audio do Instagram:", err);
    return null;
  }
}
