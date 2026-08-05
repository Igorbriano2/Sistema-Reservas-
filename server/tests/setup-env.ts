process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://reservas:reservas@localhost:5432/reservas_test";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret-nao-usar-em-producao-123456";
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "1h";
process.env.TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY ?? "ab".repeat(32);
process.env.INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET ?? "test-app-secret";
process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? "test-verify-token";
