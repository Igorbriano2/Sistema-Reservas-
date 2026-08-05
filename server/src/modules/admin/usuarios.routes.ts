import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { papelUsuarioEnum, usuarios } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { hashPassword } from "../../lib/password.js";
import { RequisicaoInvalidaError } from "../../lib/errors.js";
import { codigoDoErroPostgres } from "../../lib/pg-error.js";

export const usuariosRouter = Router();

const criarUsuarioSchema = z.object({
  nome: z.string().min(1),
  email: z.string().email(),
  senha: z.string().min(8, "senha deve ter pelo menos 8 caracteres"),
  papel: z.enum(papelUsuarioEnum.enumValues),
});

const PG_UNIQUE_VIOLATION = "23505";

function ehViolacaoDeUnicidade(err: unknown): boolean {
  return codigoDoErroPostgres(err) === PG_UNIQUE_VIOLATION;
}

// owner ve e cria logins da propria empresa diretamente (sem convite por e-mail no
// MVP). funcionario nao acessa nada aqui (requireRole("owner") aplicado no index.ts).
usuariosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const lista = await db
      .select({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email, papel: usuarios.papel, criadoEm: usuarios.criadoEm })
      .from(usuarios)
      .where(eq(usuarios.empresaId, req.auth!.empresaId));
    res.json(lista);
  }),
);

usuariosRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const dados = criarUsuarioSchema.parse(req.body);
    const senhaHash = await hashPassword(dados.senha);

    try {
      const [usuario] = await db
        .insert(usuarios)
        .values({
          empresaId: req.auth!.empresaId,
          nome: dados.nome,
          email: dados.email.toLowerCase(),
          senhaHash,
          papel: dados.papel,
        })
        .returning({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email, papel: usuarios.papel, criadoEm: usuarios.criadoEm });
      res.status(201).json(usuario);
    } catch (err) {
      if (ehViolacaoDeUnicidade(err)) {
        throw new RequisicaoInvalidaError("Ja existe um usuario com este email");
      }
      throw err;
    }
  }),
);
