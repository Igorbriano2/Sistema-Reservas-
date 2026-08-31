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
  // Fallback do agente (doc 39) - usado SO quando a chamada primaria falha
  // (credito/billing, rate limit, indisponibilidade), pra conversa nao ficar sem
  // resposta so por causa de uma unica API estar fora. Opcional: sem essa chave, o
  // agente continua so com Claude (comportamento padrao, ver orchestrator.ts).
  OPENAI_API_KEY: z.string().optional(),
  // "Terra" (tier intermediario da familia GPT-5.6, equivalente em papel ao Sonnet -
  // ver doc 39) - gpt-4o (usado antes) e um modelo bem mais antigo/fraco, e explicou
  // erros de raciocinio (ex: confundir data pedida pelo cliente com "hoje") quando
  // OpenAI virou temporariamente a IA principal.
  OPENAI_MODEL: z.string().default("gpt-5.6-terra"),
  // Doc 42 - transcricao de audio (mensagens de voz do Instagram). Sempre via OpenAI
  // (Whisper), mesmo quando a Anthropic e a IA principal do texto - a Claude API nao
  // aceita audio bruto como entrada. So e usada se OPENAI_API_KEY estiver configurada;
  // sem ela, audio recebido pede pro cliente escrever em texto (ver process-event.ts).
  OPENAI_TRANSCRIPTION_MODEL: z.string().default("whisper-1"),
  // Qual das duas e a PRIMARIA (a outra vira o fallback automatico) - flag reversivel
  // pra trocar sem precisar mexer em codigo/deploy, ex: credito da Claude acabou,
  // troca pra "openai" temporariamente no painel da DigitalOcean e volta depois so
  // mudando essa variavel de novo. Default "anthropic" mantem o comportamento de sempre.
  AGENT_PROVIDER_PRINCIPAL: z.enum(["anthropic", "openai"]).default("anthropic"),
  INSTAGRAM_APP_SECRET: z.string().optional(),
  INSTAGRAM_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  // Conexao self-service (doc 14, "Meta Login for Business") - alternativa ao
  // instagram:connect manual, os dois coexistem. APP_ID e o client_id publico do app
  // no Meta for Developers; APP_SECRET (acima) e reaproveitado tambem pra trocar o
  // code por token (mesmo app, mesmo segredo usado na assinatura do webhook).
  INSTAGRAM_APP_ID: z.string().optional(),
  // URL exata cadastrada no painel da Meta como redirect_uri valido (precisa bater
  // caractere por caractere - normalmente "<API_BASE_URL>/auth/instagram/callback").
  INSTAGRAM_OAUTH_REDIRECT_URI: z.string().optional(),
  // Segredo do state assinado (protecao CSRF do OAuth) - cai para JWT_SECRET se nao
  // definido, mesmo esquema do RESERVATION_LINK_SECRET.
  INSTAGRAM_OAUTH_STATE_SECRET: z.string().optional(),
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
  // Disparado na hora (nao pelo agendador diario) quando o dono chama um cliente da
  // fila de espera (doc 20) - avisa que a mesa esta pronta.
  WHATSAPP_TEMPLATE_FILA_ESPERA: z.string().default("mesa_pronta"),
  WHATSAPP_TEMPLATE_LANG: z.string().default("pt_BR"),
  // Cron (formato node-cron) de quando as 3 rotinas diarias de marketing rodam.
  WHATSAPP_SCHEDULER_CRON: z.string().default("0 10 * * *"),
});

// Em producao, alguns "optional" acima deixam de ser opcionais de verdade - sem eles o
// app sobe normalmente mas falha (ou pior, fica inseguro) so quando o fluxo relevante
// e usado pela primeira vez. Falha AGORA, no boot, com uma mensagem clara, em vez de
// devolver 400/500 pro primeiro cliente que tentar pagar ou pro primeiro webhook da
// Stripe que chegar sem ninguem notar a causa raiz.
const envSchemaComRegrasDeProducao = envSchema.superRefine((valores, ctx) => {
  if (valores.NODE_ENV !== "production") return;
  if (valores.STRIPE_SECRET_KEY && !valores.STRIPE_WEBHOOK_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["STRIPE_WEBHOOK_SECRET"],
      message: "STRIPE_WEBHOOK_SECRET e obrigatorio em producao quando STRIPE_SECRET_KEY esta configurada (sem ele, o endpoint de webhook rejeita todo evento e assinaturas nunca atualizam).",
    });
  }
});

export const env = envSchemaComRegrasDeProducao.parse(process.env);
