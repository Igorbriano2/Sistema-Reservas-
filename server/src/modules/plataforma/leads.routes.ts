import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { leadStatusEnum, waitlistLeads } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { criarEmpresaComOwner } from "../../lib/empresas.js";
import { RecursoNaoEncontradoError, RequisicaoInvalidaError } from "../../lib/errors.js";

export const leadsRouter = Router();

leadsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const lista = await db.select().from(waitlistLeads).orderBy(desc(waitlistLeads.criadoEm));
    res.json(lista);
  }),
);

const atualizarLeadSchema = z.object({ status: z.enum(leadStatusEnum.enumValues) });

leadsRouter.patch(
  "/:leadId",
  asyncHandler(async (req, res) => {
    const dados = atualizarLeadSchema.parse(req.body);
    const [lead] = await db
      .update(waitlistLeads)
      .set({ status: dados.status })
      .where(eq(waitlistLeads.id, req.params.leadId))
      .returning();
    if (!lead) {
      throw new RecursoNaoEncontradoError("Lead nao encontrado");
    }
    res.json(lead);
  }),
);

const converterLeadSchema = z.object({
  senha: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
});

// Cria a empresa/unidade/login owner a partir dos dados do lead, e marca o lead como
// convertido. A senha do primeiro login e definida aqui (nao existe convite por
// email ainda - mesmo criterio usado pra funcionario dentro do painel do restaurante).
leadsRouter.post(
  "/:leadId/converter",
  asyncHandler(async (req, res) => {
    const dados = converterLeadSchema.parse(req.body);
    const [lead] = await db.select().from(waitlistLeads).where(eq(waitlistLeads.id, req.params.leadId)).limit(1);
    if (!lead) {
      throw new RecursoNaoEncontradoError("Lead nao encontrado");
    }
    if (lead.status === "convertido") {
      throw new RequisicaoInvalidaError("Este lead ja foi convertido em cliente");
    }

    const { empresa } = await criarEmpresaComOwner(db, {
      nomeEmpresa: lead.nomeRestaurante,
      ownerNome: lead.nome,
      ownerEmail: lead.email,
      ownerSenha: dados.senha,
    });

    const [leadAtualizado] = await db
      .update(waitlistLeads)
      .set({ status: "convertido", convertidoEmpresaId: empresa.id })
      .where(eq(waitlistLeads.id, lead.id))
      .returning();

    res.status(201).json({ empresa, lead: leadAtualizado });
  }),
);
