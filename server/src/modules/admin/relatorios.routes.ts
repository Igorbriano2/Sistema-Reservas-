import { Router } from "express";
import { z } from "zod";
import { db } from "../../db/client.js";
import { gerarRelatorio } from "../../lib/relatorios.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { RequisicaoInvalidaError } from "../../lib/errors.js";

export const relatoriosRouter = Router({ mergeParams: true });

const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato YYYY-MM-DD");
const querySchema = z.object({ dataInicio: dataSchema, dataFim: dataSchema });

relatoriosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new RequisicaoInvalidaError("Informe dataInicio e dataFim no formato YYYY-MM-DD");
    }
    if (parsed.data.dataFim < parsed.data.dataInicio) {
      throw new RequisicaoInvalidaError("dataFim deve ser maior ou igual a dataInicio");
    }
    const relatorio = await gerarRelatorio(db, { unidadeId: req.unidadeId!, ...parsed.data });
    res.json(relatorio);
  }),
);
