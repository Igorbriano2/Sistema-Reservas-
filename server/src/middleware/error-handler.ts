import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { MulterError } from "multer";
import { AppError } from "../lib/errors.js";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Dados invalidos", detalhes: err.issues });
    return;
  }
  if (err instanceof MulterError) {
    const mensagem = err.code === "LIMIT_FILE_SIZE" ? "Imagem muito grande (limite de 3MB)." : "Nao foi possivel processar o arquivo enviado.";
    res.status(400).json({ error: mensagem });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Erro interno" });
}
