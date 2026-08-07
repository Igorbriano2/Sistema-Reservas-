process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://reservas:reservas@localhost:5432/reservas_test";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret-nao-usar-em-producao-123456";
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "1h";
process.env.TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY ?? "ab".repeat(32);
process.env.INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET ?? "test-app-secret";
process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? "test-verify-token";
process.env.WEB_APP_URL = process.env.WEB_APP_URL ?? "https://app.teste.com";
// Curto nos testes: os que dependem do turno do agente disparar de verdade so
// precisam de uma espera real pequena depois de chamar processarEventoDoInstagram.
// Os testes dedicados ao agrupamento usam fake timers, entao o valor exato nao importa ali.
process.env.AGENT_DEBOUNCE_MS = process.env.AGENT_DEBOUNCE_MS ?? "50";
// Par de chaves VAPID valido (formato), so pra exercitar o caminho de envio de push
// nos testes (o envio de verdade e sempre mockado - ver push.test.ts).
process.env.VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ?? "BDNSlr4wn0INb1MTtl_oE9au71xjuDvImJP-kOhEAoVPo2YEoyHyQIbbY34Fgfte5uyxUGr3qOcTScB-evqHDOg";
process.env.VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "3ygRuW5t88P3gCXTEsP0PJ3zP_OKgyDA_tK8coW9ak8";
process.env.WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET ?? "test-whatsapp-app-secret";
process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? "test-whatsapp-verify-token";
process.env.INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID ?? "test-instagram-app-id";
process.env.INSTAGRAM_OAUTH_REDIRECT_URI =
  process.env.INSTAGRAM_OAUTH_REDIRECT_URI ?? "https://api.teste.com/auth/instagram/callback";
