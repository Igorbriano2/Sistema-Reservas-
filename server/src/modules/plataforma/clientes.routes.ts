import { Router } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { assinaturaStatusEnum, empresas, suporteAcessos, usuarios } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { RecursoNaoEncontradoError, RequisicaoInvalidaError } from "../../lib/errors.js";
import { hashPassword } from "../../lib/password.js";
import { codigoDoErroPostgres } from "../../lib/pg-error.js";
import { signAuthToken } from "../../lib/jwt.js";

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

// Doc 36 - "editar login" cobre os 3 campos do dono (nome, email, senha) numa unica
// rota: sem essa flexibilizacao, o admin da plataforma so conseguia trocar o e-mail
// se TAMBEM redefinisse a senha (mesmo sem precisar). Motivado por assinaturas pagas
// via Pix direto pro dono da plataforma (fora do fluxo automatico da Stripe) - pra
// essas, ele precisa de controle manual total sobre a conta do cliente.
const editarLoginOwnerSchema = z
  .object({
    nome: z.string().min(1).optional(),
    // So troca o e-mail/senha de login se o admin da plataforma explicitamente
    // informar um novo valor - sem isso, o campo correspondente fica como esta.
    email: z.string().email().optional(),
    senha: z.string().min(8, "Senha deve ter pelo menos 8 caracteres").optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "Informe ao menos um campo para atualizar");

// Suporte: o dono do restaurante perdeu a senha (ou trocou de e-mail, ou nunca chegou
// a receber - nao existe convite por e-mail no MVP) e nao ha fluxo de "esqueci minha
// senha" ainda. So o admin da plataforma pode editar, direto pelo login "owner" da
// empresa (sempre existe exatamente um, criado em criarEmpresaComOwner).
clientesRouter.patch(
  "/:empresaId/login-owner",
  asyncHandler(async (req, res) => {
    const dados = editarLoginOwnerSchema.parse(req.body);
    const [owner] = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(and(eq(usuarios.empresaId, req.params.empresaId), eq(usuarios.papel, "owner")))
      .limit(1);
    if (!owner) {
      throw new RecursoNaoEncontradoError("Cliente (ou login de dono) nao encontrado");
    }

    const valores: { nome?: string; email?: string; senhaHash?: string } = {};
    if (dados.nome) valores.nome = dados.nome;
    if (dados.email) valores.email = dados.email.toLowerCase();
    if (dados.senha) valores.senhaHash = await hashPassword(dados.senha);

    try {
      const [atualizado] = await db
        .update(usuarios)
        .set(valores)
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

// "Acessar como" (suporte): loga o dono da plataforma DIRETO no painel do restaurante,
// sem precisar da senha do dono - resolve o caso "o restaurante precisa de ajuda com
// algo" sem depender de pedir a senha por telefone/WhatsApp. Emite um token de
// restaurante normal (signAuthToken, mesmo formato do login comum) pro login "owner"
// da empresa - o frontend abre isso numa aba nova, sem afetar a sessao de plataforma
// da aba atual (chaves de localStorage diferentes, ver PlataformaAuthContext). Toda
// chamada fica registrada em suporte_acessos pra auditoria (quem acessou, quando).
clientesRouter.post(
  "/:empresaId/acessar",
  asyncHandler(async (req, res) => {
    const [owner] = await db
      .select()
      .from(usuarios)
      .where(and(eq(usuarios.empresaId, req.params.empresaId), eq(usuarios.papel, "owner")))
      .orderBy(asc(usuarios.criadoEm))
      .limit(1);
    if (!owner) {
      throw new RecursoNaoEncontradoError("Cliente (ou login de dono) nao encontrado");
    }

    const [empresa] = await db
      .select({ nome: empresas.nome })
      .from(empresas)
      .where(eq(empresas.id, owner.empresaId))
      .limit(1);

    const token = signAuthToken({ sub: owner.id, empresaId: owner.empresaId, papel: owner.papel });

    await db.insert(suporteAcessos).values({
      plataformaAdminId: req.plataformaAuth!.sub,
      empresaId: owner.empresaId,
      usuarioAcessadoId: owner.id,
    });

    res.json({
      token,
      usuario: {
        id: owner.id,
        nome: owner.nome,
        email: owner.email,
        username: owner.username,
        papel: owner.papel,
        empresaId: owner.empresaId,
      },
      empresaNome: empresa?.nome ?? null,
    });
  }),
);

// Doc 36 - exclusao definitiva da conta (empresa + tudo dela: unidades, reservas,
// usuarios, conversas, assinaturas, etc, via cascade do schema). Sem soft-delete: e
// uma exclusao real, pensada pra quando o dono da plataforma decide encerrar de vez
// uma conta (ex: cliente que pagava por Pix e parou, ou pediu pra sair). O cascade foi
// verificado manualmente - reservas.unidade_id e cascade, entao reservas somem ANTES
// do delete alcancar saloes/mesas (que tem reservas.salao_id/mesa_id como restrict),
// sem violar a constraint.
clientesRouter.delete(
  "/:empresaId",
  asyncHandler(async (req, res) => {
    const [apagada] = await db.delete(empresas).where(eq(empresas.id, req.params.empresaId)).returning({ id: empresas.id });
    if (!apagada) {
      throw new RecursoNaoEncontradoError("Cliente nao encontrado");
    }
    res.status(204).send();
  }),
);
