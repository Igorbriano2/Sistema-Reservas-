import { Router } from "express";
import { z } from "zod";
import { db } from "../../db/client.js";
import { criarBloqueio, listarBloqueiosAtivos, removerBloqueio } from "../../lib/bloqueios.js";
import { asyncHandler } from "../../lib/async-handler.js";

export const bloqueiosRouter = Router({ mergeParams: true });

const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato YYYY-MM-DD");

const criarBloqueioSchema = z
  .object({
    mesaId: z.string().uuid().optional(),
    salaoId: z.string().uuid().optional(),
    dataInicio: dataSchema,
    dataFim: dataSchema,
    motivo: z.string().min(1),
  })
  .refine((d) => !!d.mesaId !== !!d.salaoId, "Informe exatamente um dos dois: mesaId ou salaoId");

bloqueiosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const lista = await listarBloqueiosAtivos(db, req.unidadeId!);
    res.json(lista);
  }),
);

bloqueiosRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const dados = criarBloqueioSchema.parse(req.body);
    const bloqueio = await criarBloqueio(db, { unidadeId: req.unidadeId!, ...dados });
    res.status(201).json(bloqueio);
  }),
);

bloqueiosRouter.delete(
  "/:bloqueioId",
  asyncHandler(async (req, res) => {
    await removerBloqueio(db, req.unidadeId!, req.params.bloqueioId);
    res.status(204).send();
  }),
);
