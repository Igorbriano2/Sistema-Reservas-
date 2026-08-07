import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { unidades, usuarioUnidades } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";

export const unidadesRouter = Router();

// Lista as unidades da propria empresa do usuario logado - usado pelo frontend admin
// para descobrir qual unidade_id usar nas demais rotas. Owner ve todas (acesso
// implicito); gerente/funcionario so veem as lojas as quais o dono deu acesso na hora
// de criar o login (doc 17) - senao a tela mostraria uma loja que a API depois barra
// com 403 quando o usuario tentasse selecionar.
unidadesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    if (req.auth!.papel === "owner") {
      const lista = await db.select().from(unidades).where(eq(unidades.empresaId, req.auth!.empresaId));
      res.json(lista);
      return;
    }

    // Inclui permissoesExtra de cada unidade - o frontend usa isso pra saber quais
    // telas mostrar pra esse gerente/funcionario, sem precisar de outro endpoint.
    const lista = await db
      .select({
        id: unidades.id,
        empresaId: unidades.empresaId,
        nome: unidades.nome,
        endereco: unidades.endereco,
        timezone: unidades.timezone,
        permissoesExtra: usuarioUnidades.permissoesExtra,
      })
      .from(unidades)
      .innerJoin(usuarioUnidades, eq(usuarioUnidades.unidadeId, unidades.id))
      .where(and(eq(unidades.empresaId, req.auth!.empresaId), eq(usuarioUnidades.usuarioId, req.auth!.sub)));
    res.json(lista);
  }),
);
