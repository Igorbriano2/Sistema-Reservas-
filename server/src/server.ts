import { env } from "./config/env.js";
import { createApp } from "./app.js";

const app = createApp();

if (env.NODE_ENV === "production") {
  if (!env.ANTHROPIC_API_KEY) console.warn("[boot] ANTHROPIC_API_KEY nao configurada - o agente nao vai funcionar.");
  if (!env.INSTAGRAM_APP_SECRET) console.warn("[boot] INSTAGRAM_APP_SECRET nao configurada - assinatura do webhook nao sera verificada!");
  if (!env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN) console.warn("[boot] INSTAGRAM_WEBHOOK_VERIFY_TOKEN nao configurada - handshake do webhook vai falhar.");
  if (!env.TOKEN_ENCRYPTION_KEY) console.warn("[boot] TOKEN_ENCRYPTION_KEY nao configurada - envio de respostas ao Instagram vai falhar.");
}

app.listen(env.PORT, () => {
  console.log(`Servidor rodando na porta ${env.PORT} (${env.NODE_ENV})`);
});
