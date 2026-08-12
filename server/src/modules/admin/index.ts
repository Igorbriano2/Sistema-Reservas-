import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { requireAssinaturaDaUnidadeAtiva, requireContaAtiva } from "../../middleware/assinatura.middleware.js";
import { requireAcessoUnidade, requirePermissaoEmpresa, requirePermissaoUnidade } from "../../middleware/permissao.middleware.js";
import { resolveUnidade } from "./unidade.middleware.js";
import { saloesRouter } from "./saloes.routes.js";
import { mesasRouter } from "./mesas.routes.js";
import { salaoElementosRouter } from "./salao-elementos.routes.js";
import { regrasHorarioRouter } from "./regras-horario.routes.js";
import { excecoesHorarioRouter } from "./excecoes-horario.routes.js";
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
import { cardapioRouter } from "./cardapio.routes.js";
import { filaEsperaRouter } from "./fila-espera.routes.js";
import { pesquisaRouter } from "./pesquisa.routes.js";

export const adminRouter = Router();

adminRouter.use(requireAuth);

// Antes do middleware de bloqueio de proposito: o dono precisa sempre conseguir ver
// o proprio status de assinatura e cancelar durante o trial, mesmo com acesso ao
// resto do painel bloqueado (assinatura atrasada alem da graca, ou cancelada).
adminRouter.use("/assinatura", requireRole("owner"), assinaturaRouter);

adminRouter.use(requireContaAtiva);

// Acessiveis por qualquer papel (owner tem acesso implicito; gerente/funcionario
// precisam de uma linha em usuario_unidades pra essa unidade especifica, ver
// unidades.routes.ts): descobrir as proprias unidades e trabalhar com reservas do dia
// (ver/criar/editar/cancelar) e disponibilidade (necessaria pra criar reserva manual
// com seguranca) - baseline sempre liberado, sem depender de nenhuma funcionalidade
// extra marcada pelo dono (doc 17).
adminRouter.use("/unidades", unidadesRouter);

// Owner ou gerente/funcionario com a funcionalidade extra marcada pelo dono (doc 17).
// "editar_agente" e "criar_usuarios" nao sao presos a uma unidade especifica (contam
// se o login tem a permissao em QUALQUER uma das lojas as quais tem acesso).
adminRouter.use("/agente-config", requirePermissaoEmpresa("editar_agente"), agenteConfigRouter);
// Papel misto por rota (connection/config = owner, feedbacks = qualquer papel) - ver
// whatsapp.routes.ts, por isso nao leva requireRole aqui no mount.
adminRouter.use("/whatsapp", whatsappRouter);
adminRouter.use("/instagram", requireRole("owner"), instagramRouter);
adminRouter.use("/usuarios", requirePermissaoEmpresa("criar_usuarios"), usuariosRouter);
// NPS customizavel (doc 21) - mesmo nivel de config estrutural do whatsappRouter
// /config (so owner).
adminRouter.use("/pesquisa-perguntas", requireRole("owner"), pesquisaRouter);

const unidadeRouter = Router({ mergeParams: true });
unidadeRouter.use(resolveUnidade);
// Doc 17, parte 5: bloqueio de assinatura por unidade (uma loja atrasada/cancelada
// nao derruba as demais da mesma empresa) - depois de resolveUnidade (usa
// req.unidadeId), antes de qualquer rota operacional da unidade.
unidadeRouter.use(requireAssinaturaDaUnidadeAtiva);
unidadeRouter.use("/saloes", requirePermissaoUnidade("editar_salao"), saloesRouter);
unidadeRouter.use("/mesas", requirePermissaoUnidade("editar_salao"), mesasRouter);
unidadeRouter.use("/salao-elementos", requirePermissaoUnidade("editar_salao"), salaoElementosRouter);
unidadeRouter.use("/regras-horario", requirePermissaoUnidade("editar_salao"), regrasHorarioRouter);
unidadeRouter.use("/excecoes-horario", requirePermissaoUnidade("editar_salao"), excecoesHorarioRouter);
unidadeRouter.use("/bloqueios", requirePermissaoUnidade("editar_salao"), bloqueiosRouter);
unidadeRouter.use("/relatorios", requirePermissaoUnidade("ver_relatorios"), relatoriosRouter);
unidadeRouter.use("/cardapio", requirePermissaoUnidade("editar_cardapio"), cardapioRouter);
unidadeRouter.use("/availability", requireAcessoUnidade, availabilityRouter);
unidadeRouter.use("/reservations", requireAcessoUnidade, reservationsRouter);
// Fila de espera de walk-in (doc 20) - mesma tarefa do dia a dia de reservas, sem
// depender de nenhuma funcionalidade extra marcada pelo dono.
unidadeRouter.use("/fila-espera", requireAcessoUnidade, filaEsperaRouter);
// Item 02 - conversas que precisam de atendimento humano viram uma aba do painel
// operacional (nao so do dono): mesmo baseline de reservas/fila-espera (so precisa de
// acesso a unidade). A conexao do Instagram em si (conectar/reconectar) continua
// owner-only, ver admin/instagram acima.
unidadeRouter.use("/conversas", requireAcessoUnidade, conversasRouter);
// So exige acesso a unidade (nao e uma funcionalidade extra "configuravel" - qualquer
// gerente/funcionario com acesso pode inscrever o proprio dispositivo).
unidadeRouter.use("/push", requireAcessoUnidade, pushRouter);

adminRouter.use("/unidades/:unidadeId", unidadeRouter);
