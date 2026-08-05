import type { NextFunction, Request, Response } from "express";
import { db } from "../../db/client.js";
import { unidadePertenceAEmpresa } from "../../lib/tenant.js";

declare global {
  namespace Express {
    interface Request {
      unidadeId?: string;
    }
  }
}

// Requer requireAuth antes. Valida que :unidadeId da rota pertence a empresa
// do usuario autenticado e expoe req.unidadeId (unico valor que os handlers
// abaixo devem usar para filtrar queries - nunca req.params.unidadeId direto).
export async function resolveUnidade(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { unidadeId } = req.params;
  if (!unidadeId || !req.auth) {
    res.status(400).json({ error: "unidadeId ausente" });
    return;
  }

  const pertence = await unidadePertenceAEmpresa(db, unidadeId, req.auth.empresaId);
  if (!pertence) {
    // 404 (nao 403): nao confirma para o cliente se a unidade existe em outra empresa.
    res.status(404).json({ error: "Unidade nao encontrada" });
    return;
  }

  req.unidadeId = unidadeId;
  next();
}
