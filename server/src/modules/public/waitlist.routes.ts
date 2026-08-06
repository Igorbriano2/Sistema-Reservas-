import { Router } from "express";
import { z } from "zod";
import { db } from "../../db/client.js";
import { waitlistLeads } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";

export const waitlistRouter = Router();

// Sem autenticacao de proposito (formulario publico da landing page, secao de
// preco) - ainda nao existe integracao de pagamento, entao isso so registra o
// interesse pra contato manual depois. Ver secao "Preco" da landing.
const corpoSchema = z.object({
  nome: z.string().trim().min(1),
  email: z.string().trim().email(),
  whatsapp: z.string().trim().min(8),
  nomeRestaurante: z.string().trim().min(1),
});

waitlistRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const dados = corpoSchema.parse(req.body);
    const [lead] = await db.insert(waitlistLeads).values(dados).returning({ id: waitlistLeads.id });
    res.status(201).json({ id: lead.id });
  }),
);
