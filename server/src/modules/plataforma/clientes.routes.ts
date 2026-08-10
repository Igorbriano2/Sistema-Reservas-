import { Router } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { assinaturaStatusEnum, empresas, usuarios } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { RecursoNaoEncontradoError, RequisicaoInvalidaError } from "../../lib/errors.js";
import { hashPassword } from "../../lib/password.js";
import { codigoDoErroPostgres } from "../../lib/pg-error.js";

export const clientesRouter = Router();

const PG_UNIQUE_VIOLATION = "23505";

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

const redefinirSenhaOwnerSchema = z.object({
  senha: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
  // Opcional: so troca o e-mail de login se o admin da plataforma explicitamente
  // informar um novo. Sem isso, so a senha muda - o dono nao perde o proprio e-mail
  // sem querer.
  email: z.string().email().optional(),
});

// Suporte: o dono do restaurante perdeu a senha (ou nunca chegou a receber - nao
// existe convite por e-mail no MVP) e nao ha fluxo de "esqueci minha senha" ainda.
// So o admin da plataforma pode redefinir, direto pelo login "owner" da empresa
// (sempre existe exatamente um, criado em criarEmpresaComOwner).
clientesRouter.post(
  "/:empresaId/redefinir-senha-owner",
  asyncHandler(async (req, res) => {
    const dados = redefinirSenhaOwnerSchema.parse(req.body);
    const [owner] = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(and(eq(usuarios.empresaId, req.params.empresaId), eq(usuarios.papel, "owner")))
      .limit(1);
    if (!owner) {
      throw new RecursoNaoEncontradoError("Cliente (ou login de dono) nao encontrado");
    }

    const senhaHash = await hashPassword(dados.senha);
    try {
      const [atualizado] = await db
        .update(usuarios)
        .set({ senhaHash, ...(dados.email && { email: dados.email.toLowerCase() }) })
        .where(eq(usuarios.id, owner.id))
        .returning({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email, username: usuarios.username });
      res.json(atualizado);
    } catch (err) {
      if (codigoDoErroPostgres(err) === PG_UNIQUE_VIOLATION) {
        throw new RequisicaoInvalidaError(`Ja existe um login com o email ${dados.email}`);
      }
      throw err;
    }
  }),
);
