import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";

let client: Anthropic | undefined;

// Lazy: so exige ANTHROPIC_API_KEY quando o agente realmente precisa falar com a
// Claude API (nao no boot do processo nem nos testes que nao chegam ate aqui).
export function getAnthropicClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY nao configurada");
  }
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}
