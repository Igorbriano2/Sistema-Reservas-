import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { feedbacks, reservas, unidades, whatsappConfig, whatsappConnections } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { requireRole } from "../../middleware/auth.middleware.js";

export const whatsappRouter = Router();

// Conexao/config sao estruturais (mesmo nivel do agente-config) - so owner. Feedbacks
// (mais abaixo) ficam abertos pra qualquer papel autenticado, ver doc 16 Parte 6.
whatsappRouter.use(["/connection", "/config"], requireRole("owner"));

// So conexao/status (nunca o access_token_encrypted) - conexao e feita fora do
// painel, via o comando whatsapp:connect (ver scripts/connect-whatsapp.ts), mesmo
// MVP manual do Instagram. Uma empresa pode ter mais de uma (uma por unidade, ou uma
// so pra empresa toda com unidade_id nulo).
whatsappRouter.get(
  "/connection",
  asyncHandler(async (req, res) => {
    const conexoes = await db
      .select({
        id: whatsappConnections.id,
        unidadeId: whatsappConnections.unidadeId,
        wabaId: whatsappConnections.wabaId,
        phoneNumberId: whatsappConnections.phoneNumberId,
        status: whatsappConnections.status,
        conectadoEm: whatsappConnections.conectadoEm,
      })
      .from(whatsappConnections)
      .where(eq(whatsappConnections.empresaId, req.auth!.empresaId))
      .orderBy(desc(whatsappConnections.conectadoEm));
    res.json(conexoes);
  }),
);

const atualizarConfigSchema = z
  .object({
    feedbackAtivo: z.boolean(),
    aniversarioAtivo: z.boolean(),
    recuperacaoAtivo: z.boolean(),
    textoAniversario: z.string().transform((v) => v.trim() || null).nullable(),
    textoRecuperacao: z.string().transform((v) => v.trim() || null).nullable(),
    diasInatividadeRecuperacao: z.number().int().positive(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Informe ao menos um campo para atualizar");

async function buscarOuCriarConfig(empresaId: string) {
  const [existente] = await db.select().from(whatsappConfig).where(eq(whatsappConfig.empresaId, empresaId)).limit(1);
  if (existente) return existente;

  const [criado] = await db.insert(whatsappConfig).values({ empresaId }).onConflictDoNothing().returning();
  if (criado) return criado;

  const [existenteAposCorrida] = await db.select().from(whatsappConfig).where(eq(whatsappConfig.empresaId, empresaId)).limit(1);
  return existenteAposCorrida;
}

whatsappRouter.get(
  "/config",
  asyncHandler(async (req, res) => {
    const config = await buscarOuCriarConfig(req.auth!.empresaId);
    res.json(config);
  }),
);

whatsappRouter.patch(
  "/config",
  asyncHandler(async (req, res) => {
    const dados = atualizarConfigSchema.parse(req.body);
    await buscarOuCriarConfig(req.auth!.empresaId);
    const [atualizado] = await db
      .update(whatsappConfig)
      .set(dados)
      .where(eq(whatsappConfig.empresaId, req.auth!.empresaId))
      .returning();
    res.json(atualizado);
  }),
);

// Feedbacks recebidos - join ate reservas/mesas/saloes/unidades pra mostrar nome do
// cliente e onde foi a reserva sem o frontend precisar de chamadas extras. Acessivel
// pra qualquer papel autenticado (nao so owner) - ver doc 16 Parte 6.
whatsappRouter.get(
  "/feedbacks",
  asyncHandler(async (req, res) => {
    const lista = await db
      .select({
        id: feedbacks.id,
        reservaId: feedbacks.reservaId,
        clienteTelefone: feedbacks.clienteTelefone,
        nota: feedbacks.nota,
        comentarioTexto: feedbacks.comentarioTexto,
        recebidoEm: feedbacks.recebidoEm,
        clienteNome: reservas.clienteNome,
        reservaData: reservas.data,
        reservaHoraInicio: reservas.horaInicio,
        unidadeNome: unidades.nome,
      })
      .from(feedbacks)
      .innerJoin(reservas, eq(reservas.id, feedbacks.reservaId))
      .innerJoin(unidades, eq(unidades.id, reservas.unidadeId))
      .where(eq(feedbacks.empresaId, req.auth!.empresaId))
      .orderBy(desc(feedbacks.recebidoEm));
    res.json(lista);
  }),
);
