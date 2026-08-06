import { randomBytes } from "node:crypto";
import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { empresas, usuarios } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { criarEmpresaComOwner } from "../../lib/empresas.js";
import { signAuthToken } from "../../lib/jwt.js";

export const modoTesteRouter = Router();

const EMAIL_DEMO = "demo@plataforma.interno";

// Garante que existe UMA empresa demo (ehDemo=true) com um owner, criando na primeira
// vez que alguem entra em modo teste. A senha gerada nunca e usada pra login de
// verdade - o acesso aqui e sempre via token assinado direto pelo backend.
async function garantirEmpresaDemo() {
  const [existente] = await db.select().from(empresas).where(eq(empresas.ehDemo, true)).limit(1);
  if (existente) {
    const [owner] = await db
      .select()
      .from(usuarios)
      .where(and(eq(usuarios.empresaId, existente.id), eq(usuarios.papel, "owner")))
      .limit(1);
    if (owner) {
      return { empresa: existente, owner };
    }
  }

  const { empresa, owner } = await criarEmpresaComOwner(db, {
    nomeEmpresa: "Restaurante Demo (modo teste)",
    unidadeNome: "Unidade Demo",
    ownerNome: "Modo Teste",
    ownerEmail: EMAIL_DEMO,
    ownerSenha: randomBytes(24).toString("hex"),
    ehDemo: true,
  });
  return { empresa, owner };
}

// Autenticado como plataforma admin (ver app.ts) - devolve um token de sessao NORMAL
// de restaurante (mesmo formato de /auth/login), pra reaproveitar 100% do painel do
// restaurante ja existente sem nenhuma logica especial la dentro.
modoTesteRouter.post(
  "/",
  asyncHandler(async (_req, res) => {
    const { empresa, owner } = await garantirEmpresaDemo();
    const token = signAuthToken({ sub: owner.id, empresaId: empresa.id, papel: "owner" });
    res.json({
      token,
      usuario: { id: owner.id, nome: owner.nome, email: owner.email, papel: owner.papel, empresaId: empresa.id },
    });
  }),
);
