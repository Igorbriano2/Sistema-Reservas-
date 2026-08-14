import OpenAI from "openai";
import { env } from "../config/env.js";

let client: OpenAI | undefined;

// Lazy, mesmo padrao de anthropic-client.ts: so exige OPENAI_API_KEY quando o
// fallback realmente precisa ser usado (nunca no boot nem nos testes que nao
// chegam ate aqui).
export function getOpenAiClient(): OpenAI {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY nao configurada");
  }
  client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return client;
}
