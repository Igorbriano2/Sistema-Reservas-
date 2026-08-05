import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { agenteConfig } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";

export const agenteConfigRouter = Router();

const faqItemSchema = z.object({ pergunta: z.string().min(1), resposta: z.string().min(1) });

const atualizarSchema = z
  .object({
    nomeDoAgente: z.string().min(1),
    descricaoRestaurante: z.string(),
    tomDeVoz: z.string(),
    saudacao: z.string(),
    despedida: z.string(),
    politicasReserva: z.string(),
    faq: z.array(faqItemSchema),
    topicosProibidos: z.array(z.string()),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Informe ao menos um campo para atualizar");

async function buscarOuCriar(empresaId: string) {
  const [existente] = await db.select().from(agenteConfig).where(eq(agenteConfig.empresaId, empresaId)).limit(1);
  if (existente) return existente;

  const [criado] = await db
    .insert(agenteConfig)
    .values({ empresaId })
    .onConflictDoNothing()
    .returning();
  if (criado) return criado;

  const [existenteAposCorrida] = await db.select().from(agenteConfig).where(eq(agenteConfig.empresaId, empresaId)).limit(1);
  return existenteAposCorrida;
}

// Config e 1:1 por empresa (nao por unidade), por isso essa rota fica fora do
// aninhamento /admin/unidades/:unidadeId - so exige requireRole("owner") (aplicado
// no index.ts) e usa req.auth.empresaId diretamente.
agenteConfigRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const config = await buscarOuCriar(req.auth!.empresaId);
    res.json(config);
  }),
);

agenteConfigRouter.patch(
  "/",
  asyncHandler(async (req, res) => {
    const dados = atualizarSchema.parse(req.body);
    await buscarOuCriar(req.auth!.empresaId);
    const [atualizado] = await db
      .update(agenteConfig)
      .set(dados)
      .where(eq(agenteConfig.empresaId, req.auth!.empresaId))
      .returning();
    res.json(atualizado);
  }),
);
