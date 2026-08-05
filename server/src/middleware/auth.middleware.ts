import type { NextFunction, Request, Response } from "express";
import { verifyAuthToken } from "../lib/jwt.js";

// Anexa req.auth = { sub, empresaId, papel } a partir do JWT.
// A partir daqui, TODA query no restante da requisicao deve filtrar por
// req.auth.empresaId (isolamento multi-tenant obrigatorio).
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Nao autenticado" });
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  try {
    req.auth = verifyAuthToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Token invalido ou expirado" });
  }
}
