import { Router } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { assinaturaStatusEnum, empresas, usuarios } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { RecursoNaoEncontradoError } from "../../lib/errors.js";

export const clientesRouter = Router();

clientesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const listaEmpresas = await db
      .select()
      .from(empresas)
      .where(eq(empresas.ehDemo, false))
      .orderBy(asc(empresas.criadoEm));

    const empresaIds = listaEmpresas.map((e) => e.id);
    // So o papel "owner" tem e-mail garantido (doc 17) - filtra explicito em vez de
    // confiar em "primeiro criado" pra nao herdar um null de gerente/funcionario.
    const owners =
      empresaIds.length === 0
        ? []
        : await db
            .select({ empresaId: usuarios.empresaId, nome: usuarios.nome, email: usuarios.email, criadoEm: usuarios.criadoEm })
            .from(usuarios)
            .where(and(inArray(usuarios.empresaId, empresaIds), eq(usuarios.papel, "owner")))
            .orderBy(asc(usuarios.criadoEm));

    // Primeiro login "owner" criado de cada empresa = contato responsavel exibido.
    const contatoPorEmpresa = new Map<string, { nome: string; email: string }>();
    for (const usuario of owners) {
      if (!contatoPorEmpresa.has(usuario.empresaId) && usuario.email) {
        contatoPorEmpresa.set(usuario.empresaId, { nome: usuario.nome, email: usuario.email });
      }
    }

    res.json(
      listaEmpresas.map((empresa) => ({
        ...empresa,
        contato: contatoPorEmpresa.get(empresa.id) ?? null,
      })),
    );
  }),
);

const atualizarClienteSchema = z
  .object({
    assinaturaStatus: z.enum(assinaturaStatusEnum.enumValues).optional(),
    plano: z.string().min(1).optional(),
    observacoes: z.string().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "Informe ao menos um campo para atualizar");

clientesRouter.patch(
  "/:empresaId",
  asyncHandler(async (req, res) => {
    const dados = atualizarClienteSchema.parse(req.body);
    const [empresa] = await db
      .update(empresas)
      .set(dados)
      .where(eq(empresas.id, req.params.empresaId))
      .returning();
    if (!empresa) {
      throw new RecursoNaoEncontradoError("Cliente nao encontrado");
    }
    res.json(empresa);
  }),
);
