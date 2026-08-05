import type { AuthTokenPayload } from "../lib/jwt.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthTokenPayload;
      // Corpo cru capturado pelo verify() do express.json(), usado para validar a
      // assinatura HMAC (X-Hub-Signature-256) do webhook do Instagram.
      rawBody?: Buffer;
    }
  }
}

export {};
