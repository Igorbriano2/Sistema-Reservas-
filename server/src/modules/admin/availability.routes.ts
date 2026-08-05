import { Router } from "express";
import { z } from "zod";
import { db } from "../../db/client.js";
import { verificarDisponibilidade } from "../../lib/availability.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { RequisicaoInvalidaError } from "../../lib/errors.js";

export const availabilityRouter = Router({ mergeParams: true });

const querySchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato YYYY-MM-DD"),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use o formato HH:MM"),
  numPessoas: z.coerce.number().int().positive(),
});

availabilityRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new RequisicaoInvalidaError(parsed.error.issues[0]?.message ?? "Parametros invalidos");
    }
    const resultado = await verificarDisponibilidade(db, {
      unidadeId: req.unidadeId!,
      data: parsed.data.data,
      hora: parsed.data.hora,
      numPessoas: parsed.data.numPessoas,
    });
    res.json(resultado);
  }),
);
