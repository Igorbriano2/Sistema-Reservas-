import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { usuarios } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";

// Rotas PUBLICAS (sem requireAuth) do assistente de checkout/assinatura (/assinar no
// frontend) - ver doc da Etapa 1 (dados cadastrais). Etapas seguintes (pagamento via
// Stripe, criacao de senha, provisionamento da empresa) entram nos proximos passos.
export const checkoutRouter = Router();

const validarEmailSchema = z.object({ email: z.string().trim().email() });

checkoutRouter.post(
  "/validar-email",
  asyncHandler(async (req, res) => {
    const { email } = validarEmailSchema.parse(req.body);
    const [existente] = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.email, email.toLowerCase()))
      .limit(1);
    res.json({ disponivel: !existente });
  }),
);
