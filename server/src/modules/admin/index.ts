import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { resolveUnidade } from "./unidade.middleware.js";
import { saloesRouter } from "./saloes.routes.js";
import { mesasRouter } from "./mesas.routes.js";
import { regrasHorarioRouter } from "./regras-horario.routes.js";
import { availabilityRouter } from "./availability.routes.js";
import { reservationsRouter } from "./reservations.routes.js";
import { bloqueiosRouter } from "./bloqueios.routes.js";
import { conversasRouter } from "./conversas.routes.js";
import { unidadesRouter } from "./unidades.routes.js";
import { agenteConfigRouter } from "./agente-config.routes.js";
import { usuariosRouter } from "./usuarios.routes.js";

export const adminRouter = Router();

adminRouter.use(requireAuth);

// Acessiveis por owner e funcionario: descobrir a propria unidade e trabalhar com
// reservas do dia (ver/criar/editar/cancelar) e disponibilidade (necessaria pra
// criar reserva manual com seguranca).
adminRouter.use("/unidades", unidadesRouter);

// Owner apenas: configuracao estrutural (mesas, saloes, regras de horario),
// personalizacao do agente de IA, e criacao de outros logins da empresa.
adminRouter.use("/agente-config", requireRole("owner"), agenteConfigRouter);
adminRouter.use("/usuarios", requireRole("owner"), usuariosRouter);

const unidadeRouter = Router({ mergeParams: true });
unidadeRouter.use(resolveUnidade);
unidadeRouter.use("/saloes", requireRole("owner"), saloesRouter);
unidadeRouter.use("/mesas", requireRole("owner"), mesasRouter);
unidadeRouter.use("/regras-horario", requireRole("owner"), regrasHorarioRouter);
unidadeRouter.use("/bloqueios", requireRole("owner"), bloqueiosRouter);
unidadeRouter.use("/availability", availabilityRouter);
unidadeRouter.use("/reservations", reservationsRouter);
unidadeRouter.use("/conversas", requireRole("owner"), conversasRouter);

adminRouter.use("/unidades/:unidadeId", unidadeRouter);
