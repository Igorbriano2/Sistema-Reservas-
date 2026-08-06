import { Router } from "express";
import { requirePlataformaAuth } from "../../middleware/plataforma-auth.middleware.js";
import { plataformaAuthRouter } from "./auth.routes.js";
import { clientesRouter } from "./clientes.routes.js";
import { leadsRouter } from "./leads.routes.js";
import { modoTesteRouter } from "./modo-teste.routes.js";

export const plataformaRouter = Router();

// /login fica fora do requirePlataformaAuth (obvio - e como voce entra). Tudo o
// resto abaixo exige um token de plataforma valido.
plataformaRouter.use("/auth", plataformaAuthRouter);
plataformaRouter.use("/clientes", requirePlataformaAuth, clientesRouter);
plataformaRouter.use("/leads", requirePlataformaAuth, leadsRouter);
plataformaRouter.use("/modo-teste", requirePlataformaAuth, modoTesteRouter);
