import type { NextFunction, Request, Response } from "express";
import { verifyAuthToken, type PapelUsuario } from "../lib/jwt.js";

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

// Requer requireAuth antes. Restringe o acesso a um subconjunto de papeis - ex.:
// requireRole("owner") em rotas de configuracao (mesas, saloes, regras de horario,
// agente_config, criacao de usuarios) que funcionario nao deve conseguir chamar,
// nem sabendo a URL exata (a checagem e no backend, nao so escondida no frontend).
export function requireRole(...papeis: PapelUsuario[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth || !papeis.includes(req.auth.papel)) {
      res.status(403).json({ error: "Acesso negado para o seu papel de usuario" });
      return;
    }
    next();
  };
}
