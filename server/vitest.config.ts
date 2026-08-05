import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup-env.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    // Testes tocam o mesmo banco Postgres (truncate entre eles), entao rodam
    // em serie para evitar condicoes de corrida artificiais entre arquivos de teste.
    fileParallelism: false,
  },
});
