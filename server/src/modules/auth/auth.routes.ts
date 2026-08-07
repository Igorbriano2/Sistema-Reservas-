import { Router } from "express";
import { eq, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { usuarios } from "../../db/schema/index.js";
import { verifyPassword } from "../../lib/password.js";
import { signAuthToken } from "../../lib/jwt.js";
import { requireAuth } from "../../middleware/auth.middleware.js";

export const authRouter = Router();

// "identificador" cobre os dois modelos de login (doc 17): dono usa e-mail OU o
// username que tambem escolheu; gerente/funcionario (sem e-mail) so tem username.
const loginSchema = z.object({
  identificador: z.string().trim().min(1),
  senha: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados invalidos" });
    return;
  }
  const { identificador, senha } = parsed.data;
  const identificadorNormalizado = identificador.toLowerCase();

  const [usuario] = await db
    .select()
    .from(usuarios)
    .where(or(eq(usuarios.email, identificadorNormalizado), eq(usuarios.username, identificadorNormalizado)))
    .limit(1);

  // Mensagem generica em ambos os casos (identificador inexistente ou senha errada)
  // para nao permitir enumeracao de contas cadastradas.
  if (!usuario) {
    res.status(401).json({ error: "Usuario ou senha invalidos" });
    return;
  }

  const senhaValida = await verifyPassword(senha, usuario.senhaHash);
  if (!senhaValida) {
    res.status(401).json({ error: "Usuario ou senha invalidos" });
    return;
  }

  const token = signAuthToken({ sub: usuario.id, empresaId: usuario.empresaId, papel: usuario.papel });

  res.json({
    token,
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      username: usuario.username,
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
    username: usuario.username,
    papel: usuario.papel,
    empresaId: usuario.empresaId,
  });
});
