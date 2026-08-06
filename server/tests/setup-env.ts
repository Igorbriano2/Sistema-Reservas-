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
