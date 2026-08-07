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
  // Segredo dedicado para o login do painel da plataforma (voce, nao os restaurantes).
  // Se nao definido, cai para JWT_SECRET (mesmo esquema do RESERVATION_LINK_SECRET
  // acima - um campo "purpose" no token evita cruzamento mesmo com segredo compartilhado).
  PLATAFORMA_JWT_SECRET: z.string().optional(),
  // Tempo de espera (ms) apos a ultima mensagem de uma rajada antes de acionar o agente,
  // agrupando mensagens seguidas do mesmo cliente numa unica resposta.
  AGENT_DEBOUNCE_MS: z.coerce.number().int().positive().default(6000),
  // Stripe (checkout/assinatura - ver /public/checkout). Chave secreta nunca sai do
  // backend. STRIPE_PRICE_ID e opcional: se vazio, o backend procura (ou cria, na
  // primeira chamada) um Price recorrente mensal de R$697 para STRIPE_PRODUCT_ID.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PRODUCT_ID: z.string().optional(),
  STRIPE_PRICE_ID: z.string().optional(),
  // Obtido so depois de registrar o endpoint de webhook no dashboard da Stripe -
  // usado pra verificar a assinatura (Stripe-Signature) dos eventos recebidos.
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  // Dias de tolerancia com uma assinatura "atrasada" (cobranca recorrente falhou)
  // antes do middleware de acesso bloquear o painel da empresa.
  ASSINATURA_ATRASO_GRACE_DIAS: z.coerce.number().int().positive().default(5),
  // Notificacoes push (doc 15 - nova reserva / cancelamento via chat). Par de chaves
  // VAPID gerado uma vez com `npx web-push generate-vapid-keys`. Sem elas, o envio de
  // push vira um no-op silencioso (nao quebra o resto do app).
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:contato@queroreservar.com.br"),
  // WhatsApp Business Cloud API (doc 16) - marketing/feedback, conexao manual (mesmo
  // padrao do Instagram, ver connect-whatsapp.ts). Usados pra verificar o webhook e
  // assinar requests, nao pra autenticar contas individuais (isso fica em
  // whatsapp_connections, uma linha por empresa).
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_GRAPH_API_VERSION: z.string().default("v21.0"),
  // Nome/id dos templates pre-aprovados pela Meta (configurados no painel dela, fora
  // do codigo - ver doc) e o codigo de idioma usado no submit. Nunca hardcoded no
  // codigo que monta a chamada de envio.
  WHATSAPP_TEMPLATE_FEEDBACK: z.string().default("feedback_pos_reserva"),
  WHATSAPP_TEMPLATE_ANIVERSARIO: z.string().default("aniversario_cliente"),
  WHATSAPP_TEMPLATE_RECUPERACAO: z.string().default("recuperacao_cliente"),
  WHATSAPP_TEMPLATE_LANG: z.string().default("pt_BR"),
  // Cron (formato node-cron) de quando as 3 rotinas diarias de marketing rodam.
  WHATSAPP_SCHEDULER_CRON: z.string().default("0 10 * * *"),
});

export const env = envSchema.parse(process.env);
