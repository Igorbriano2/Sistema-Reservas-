import express from "express";
import cors from "cors";
import helmet from "helmet";
import { authRouter } from "./modules/auth/auth.routes.js";
import { adminRouter } from "./modules/admin/index.js";
import { webhookRouter } from "./modules/agent/webhook.routes.js";
import { errorHandler } from "./middleware/error-handler.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(
    express.json({
      // Guarda o corpo cru para validar a assinatura HMAC do webhook do Instagram
      // (a verificacao precisa dos bytes exatamente como recebidos, nao do JSON re-serializado).
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = Buffer.from(buf);
      },
    }),
  );

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/auth", authRouter);
  app.use("/admin", adminRouter);
  app.use("/agent/webhook", webhookRouter);

  app.use(errorHandler);

  return app;
}
