import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { usuarios } from "../../db/schema/index.js";
import { verifyPassword } from "../../lib/password.js";
import { signAuthToken } from "../../lib/jwt.js";
import { requireAuth } from "../../middleware/auth.middleware.js";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados invalidos" });
    return;
  }
  const { email, senha } = parsed.data;

  const [usuario] = await db
    .select()
    .from(usuarios)
    .where(eq(usuarios.email, email.toLowerCase()))
    .limit(1);

  // Mensagem generica em ambos os casos (email inexistente ou senha errada)
  // para nao permitir enumeracao de emails cadastrados.
  if (!usuario) {
    res.status(401).json({ error: "Email ou senha invalidos" });
    return;
  }

  const senhaValida = await verifyPassword(senha, usuario.senhaHash);
  if (!senhaValida) {
    res.status(401).json({ error: "Email ou senha invalidos" });
    return;
  }

  const token = signAuthToken({ sub: usuario.id, empresaId: usuario.empresaId, papel: usuario.papel });

  res.json({
    token,
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      papel: usuario.papel,
      empresaId: usuario.empresaId,
    },
  });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const [usuario] = await db
    .select()
    .from(usuarios)
    .where(eq(usuarios.id, req.auth!.sub))
    .limit(1);

  if (!usuario) {
    res.status(404).json({ error: "Usuario nao encontrado" });
    return;
  }

  res.json({
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    papel: usuario.papel,
    empresaId: usuario.empresaId,
  });
});
