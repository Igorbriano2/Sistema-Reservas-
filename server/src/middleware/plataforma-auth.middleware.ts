import type { NextFunction, Request, Response } from "express";
import { verifyPlataformaToken, type PlataformaAuthPayload } from "../lib/plataforma-jwt.js";

declare global {
  namespace Express {
    interface Request {
      plataformaAuth?: PlataformaAuthPayload;
    }
  }
}

// Anexa req.plataformaAuth = { sub } a partir de um token de plataforma (nunca aceita
// um token de sessao normal de restaurante - ver purpose em plataforma-jwt.ts).
export function requirePlataformaAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Nao autenticado" });
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  try {
    req.plataformaAuth = verifyPlataformaToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Token invalido ou expirado" });
  }
}
