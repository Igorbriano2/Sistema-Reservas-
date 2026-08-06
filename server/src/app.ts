import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { adminRouter } from "./modules/admin/index.js";
import { webhookRouter } from "./modules/agent/webhook.routes.js";
import { reservationLinkRouter } from "./modules/public/reservation-link.routes.js";
import { waitlistRouter } from "./modules/public/waitlist.routes.js";
import { errorHandler } from "./middleware/error-handler.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  // Sem CORS_ORIGIN configurada (dev local), aceita qualquer origem. Em producao,
  // configure para a URL do frontend admin (ver .do/app.api.yaml).
  app.use(cors({ origin: env.CORS_ORIGIN || true }));
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
  app.use("/public/reservation-link", reservationLinkRouter);
  app.use("/public/waitlist", waitlistRouter);

  app.use(errorHandler);

  return app;
}
