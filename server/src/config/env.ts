import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL e obrigatorio"),
  DATABASE_SSL: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET deve ter pelo menos 16 caracteres"),
  JWT_EXPIRES_IN: z.string().default("8h"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5"),
  INSTAGRAM_APP_SECRET: z.string().optional(),
  INSTAGRAM_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  // Chave AES-256 em hex (64 caracteres = 32 bytes), gerada com `openssl rand -hex 32`.
  // Usada para cifrar/decifrar instagram_connections.access_token_encrypted.
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "TOKEN_ENCRYPTION_KEY deve ter 64 caracteres hexadecimais (32 bytes)")
    .optional(),
  // URL publica do frontend admin, para restringir o CORS em producao (ex:
  // https://sistema-reservas-web-xxxxx.ondigitalocean.app). Sem isso, aceita qualquer origem.
  CORS_ORIGIN: z.string().optional(),
  // URL publica do frontend (mesmo app do CORS_ORIGIN normalmente), usada para montar o
  // link publico de reserva enviado pelo agente (get_reservation_link): "<WEB_APP_URL>/reservar/<token>".
  WEB_APP_URL: z.string().optional(),
  // Segredo usado para assinar o token de curta duracao do link publico de reserva.
  // Se nao definido, cai para JWT_SECRET (os tokens carregam um campo "purpose" para
  // nao serem confundidos com tokens de sessao do admin mesmo compartilhando segredo).
  RESERVATION_LINK_SECRET: z.string().optional(),
  // Tempo de espera (ms) apos a ultima mensagem de uma rajada antes de acionar o agente,
  // agrupando mensagens seguidas do mesmo cliente numa unica resposta.
  AGENT_DEBOUNCE_MS: z.coerce.number().int().positive().default(6000),
});

export const env = envSchema.parse(process.env);
