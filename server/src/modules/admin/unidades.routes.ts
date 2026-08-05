import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { unidades } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";

export const unidadesRouter = Router();

// Lista as unidades da propria empresa do usuario logado - usado pelo frontend admin
// para descobrir qual unidade_id usar nas demais rotas (nao ha selecao de unidade no
// login, ja que usuarios so tem empresa_id no MVP; ver decisao registrada na parte de
// autenticacao/endpoints administrativos).
unidadesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const lista = await db.select().from(unidades).where(eq(unidades.empresaId, req.auth!.empresaId));
    res.json(lista);
  }),
);
