import { env } from "./config/env.js";
import { createApp } from "./app.js";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`Servidor rodando na porta ${env.PORT} (${env.NODE_ENV})`);
});
