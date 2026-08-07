import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { requireAssinaturaAtiva } from "../../middleware/assinatura.middleware.js";
import { resolveUnidade } from "./unidade.middleware.js";
import { saloesRouter } from "./saloes.routes.js";
import { mesasRouter } from "./mesas.routes.js";
import { salaoElementosRouter } from "./salao-elementos.routes.js";
import { regrasHorarioRouter } from "./regras-horario.routes.js";
import { availabilityRouter } from "./availability.routes.js";
import { reservationsRouter } from "./reservations.routes.js";
import { bloqueiosRouter } from "./bloqueios.routes.js";
import { pushRouter } from "./push.routes.js";
import { relatoriosRouter } from "./relatorios.routes.js";
import { conversasRouter } from "./conversas.routes.js";
import { unidadesRouter } from "./unidades.routes.js";
import { agenteConfigRouter } from "./agente-config.routes.js";
import { whatsappRouter } from "./whatsapp.routes.js";
import { instagramRouter } from "./instagram.routes.js";
import { usuariosRouter } from "./usuarios.routes.js";
import { assinaturaRouter } from "./assinatura.routes.js";

export const adminRouter = Router();

adminRouter.use(requireAuth);

// Antes do middleware de bloqueio de proposito: o dono precisa sempre conseguir ver
// o proprio status de assinatura e cancelar durante o trial, mesmo com acesso ao
// resto do painel bloqueado (assinatura atrasada alem da graca, ou cancelada).
adminRouter.use("/assinatura", requireRole("owner"), assinaturaRouter);

adminRouter.use(requireAssinaturaAtiva);

// Acessiveis por owner e funcionario: descobrir a propria unidade e trabalhar com
// reservas do dia (ver/criar/editar/cancelar) e disponibilidade (necessaria pra
// criar reserva manual com seguranca).
adminRouter.use("/unidades", unidadesRouter);

// Owner apenas: configuracao estrutural (mesas, saloes, regras de horario),
// personalizacao do agente de IA, e criacao de outros logins da empresa.
adminRouter.use("/agente-config", requireRole("owner"), agenteConfigRouter);
// Papel misto por rota (connection/config = owner, feedbacks = qualquer papel) - ver
// whatsapp.routes.ts, por isso nao leva requireRole aqui no mount.
adminRouter.use("/whatsapp", whatsappRouter);
adminRouter.use("/instagram", requireRole("owner"), instagramRouter);
adminRouter.use("/usuarios", requireRole("owner"), usuariosRouter);

const unidadeRouter = Router({ mergeParams: true });
unidadeRouter.use(resolveUnidade);
unidadeRouter.use("/saloes", requireRole("owner"), saloesRouter);
unidadeRouter.use("/mesas", requireRole("owner"), mesasRouter);
unidadeRouter.use("/salao-elementos", requireRole("owner"), salaoElementosRouter);
unidadeRouter.use("/regras-horario", requireRole("owner"), regrasHorarioRouter);
unidadeRouter.use("/bloqueios", requireRole("owner"), bloqueiosRouter);
unidadeRouter.use("/relatorios", requireRole("owner"), relatoriosRouter);
unidadeRouter.use("/availability", availabilityRouter);
unidadeRouter.use("/reservations", reservationsRouter);
unidadeRouter.use("/conversas", requireRole("owner"), conversasRouter);
// Sem requireRole: qualquer funcionario logado pode inscrever o proprio dispositivo
// pra receber notificacoes (nao e uma configuracao estrutural da unidade).
unidadeRouter.use("/push", pushRouter);

adminRouter.use("/unidades/:unidadeId", unidadeRouter);
