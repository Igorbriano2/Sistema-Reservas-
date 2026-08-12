import { Router } from "express";
import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { plataformaAdmins } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { RequisicaoInvalidaError } from "../../lib/errors.js";
import { hashPassword } from "../../lib/password.js";
import { codigoDoErroPostgres } from "../../lib/pg-error.js";

// Gerenciamento dos proprios logins de dono da plataforma - antes so existia via
// SEED_PLATAFORMA_EMAIL/SENHA (um unico admin, criado a mao no seed). Qualquer admin
// logado pode listar/criar/excluir outros (nao ha hierarquia entre eles - todos tem o
// mesmo nivel de acesso, "dono da plataforma"), com duas travas pra nunca gerar uma
// conta sem ninguem com acesso: nao pode excluir a si mesmo, nem excluir o ultimo
// admin restante.
export const adminsRouter = Router();

const PG_UNIQUE_VIOLATION = "23505";

adminsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const lista = await db
      .select({ id: plataformaAdmins.id, nome: plataformaAdmins.nome, email: plataformaAdmins.email, criadoEm: plataformaAdmins.criadoEm })
      .from(plataformaAdmins)
      .orderBy(asc(plataformaAdmins.criadoEm));
    res.json(lista);
  }),
);

const criarAdminSchema = z.object({
  nome: z.string().min(1),
  email: z.string().email(),
  senha: z.string().min(8, "senha deve ter pelo menos 8 caracteres"),
});

adminsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const dados = criarAdminSchema.parse(req.body);
    const senhaHash = await hashPassword(dados.senha);

    try {
      const [admin] = await db
        .insert(plataformaAdmins)
        .values({ nome: dados.nome, email: dados.email.toLowerCase(), senhaHash })
        .returning({ id: plataformaAdmins.id, nome: plataformaAdmins.nome, email: plataformaAdmins.email, criadoEm: plataformaAdmins.criadoEm });
      res.status(201).json(admin);
    } catch (err) {
      if (codigoDoErroPostgres(err) === PG_UNIQUE_VIOLATION) {
        throw new RequisicaoInvalidaError(`Ja existe um admin com o email ${dados.email}`);
      }
      throw err;
    }
  }),
);

adminsRouter.delete(
  "/:adminId",
  asyncHandler(async (req, res) => {
    if (req.params.adminId === req.plataformaAuth!.sub) {
      throw new RequisicaoInvalidaError("Voce nao pode excluir o proprio login");
    }

    const todos = await db.select({ id: plataformaAdmins.id }).from(plataformaAdmins);
    if (todos.length <= 1) {
      throw new RequisicaoInvalidaError("Nao e possivel excluir o ultimo admin da plataforma");
    }
    if (!todos.some((a) => a.id === req.params.adminId)) {
      throw new RequisicaoInvalidaError("Admin nao encontrado");
    }

    await db.delete(plataformaAdmins).where(and(eq(plataformaAdmins.id, req.params.adminId), ne(plataformaAdmins.id, req.plataformaAuth!.sub)));
    res.status(204).send();
  }),
);
