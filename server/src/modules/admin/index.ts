import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { resolveUnidade } from "./unidade.middleware.js";
import { saloesRouter } from "./saloes.routes.js";
import { mesasRouter } from "./mesas.routes.js";
import { regrasHorarioRouter } from "./regras-horario.routes.js";
import { availabilityRouter } from "./availability.routes.js";
import { reservationsRouter } from "./reservations.routes.js";
import { conversasRouter } from "./conversas.routes.js";
import { unidadesRouter } from "./unidades.routes.js";

export const adminRouter = Router();

adminRouter.use(requireAuth);

adminRouter.use("/unidades", unidadesRouter);

const unidadeRouter = Router({ mergeParams: true });
unidadeRouter.use(resolveUnidade);
unidadeRouter.use("/saloes", saloesRouter);
unidadeRouter.use("/mesas", mesasRouter);
unidadeRouter.use("/regras-horario", regrasHorarioRouter);
unidadeRouter.use("/availability", availabilityRouter);
unidadeRouter.use("/reservations", reservationsRouter);
unidadeRouter.use("/conversas", conversasRouter);

adminRouter.use("/unidades/:unidadeId", unidadeRouter);
