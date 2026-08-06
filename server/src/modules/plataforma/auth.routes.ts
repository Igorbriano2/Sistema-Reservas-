import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { plataformaAdmins } from "../../db/schema/index.js";
import { verifyPassword } from "../../lib/password.js";
import { signPlataformaToken } from "../../lib/plataforma-jwt.js";
import { requirePlataformaAuth } from "../../middleware/plataforma-auth.middleware.js";

export const plataformaAuthRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
});

plataformaAuthRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados invalidos" });
    return;
  }
  const { email, senha } = parsed.data;

  const [admin] = await db
    .select()
    .from(plataformaAdmins)
    .where(eq(plataformaAdmins.email, email.toLowerCase()))
    .limit(1);

  // Mensagem generica em ambos os casos, mesmo padrao do /auth/login de restaurante.
  if (!admin) {
    res.status(401).json({ error: "Email ou senha invalidos" });
    return;
  }
  const senhaValida = await verifyPassword(senha, admin.senhaHash);
  if (!senhaValida) {
    res.status(401).json({ error: "Email ou senha invalidos" });
    return;
  }

  const token = signPlataformaToken(admin.id);
  res.json({ token, admin: { id: admin.id, nome: admin.nome, email: admin.email } });
});

plataformaAuthRouter.get("/me", requirePlataformaAuth, async (req, res) => {
  const [admin] = await db
    .select()
    .from(plataformaAdmins)
    .where(eq(plataformaAdmins.id, req.plataformaAuth!.sub))
    .limit(1);

  if (!admin) {
    res.status(404).json({ error: "Login de plataforma nao encontrado" });
    return;
  }
  res.json({ id: admin.id, nome: admin.nome, email: admin.email });
});
