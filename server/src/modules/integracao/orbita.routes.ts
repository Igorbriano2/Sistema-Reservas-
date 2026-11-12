import { randomBytes, timingSafeEqual } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { and, asc, eq, gte, ilike, inArray, lte, or } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { empresas, mesas, reservas, saloes, unidades, usuarios } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { criarEmpresaComOwner, derivarSlugDoNome, gerarSlugDisponivel } from "../../lib/empresas.js";
import { AppError, RecursoNaoEncontradoError, RequisicaoInvalidaError } from "../../lib/errors.js";
import { signOrbitaSso } from "../../lib/orbita-sso.js";

// Integracao com o Orbita (PDV/gestao de restaurantes). O Orbita liga o modulo
// "Reservas" por cliente: cria (ou vincula) a empresa aqui, abre o painel ja logado
// (codigo de entrada de 2 min) e le as reservas para mostrar no proprio sistema.
// Servidor a servidor: Authorization: Bearer <INTEGRACAO_ORBITA_SECRET>.
export const integracaoOrbitaRouter = Router();

function exigirChave(req: Request, res: Response, next: NextFunction): void {
  const segredo = env.INTEGRACAO_ORBITA_SECRET;
  if (!segredo) {
    res.status(404).json({ error: "Nao encontrado" });
    return;
  }
  const header = req.header("authorization") ?? "";
  const recebido = Buffer.from(header.startsWith("Bearer ") ? header.slice(7).trim() : "");
  const esperado = Buffer.from(segredo);
  if (recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) {
    res.status(401).json({ error: "Chave da integracao invalida" });
    return;
  }
  next();
}

integracaoOrbitaRouter.use(exigirChave);

class ConflitoError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}

async function resumoEmpresa(empresaId: string) {
  const [empresa] = await db.select().from(empresas).where(eq(empresas.id, empresaId)).limit(1);
  if (!empresa) throw new RecursoNaoEncontradoError("Empresa nao encontrada");
  const lista = await db
    .select({ id: unidades.id, nome: unidades.nome, slug: unidades.slug })
    .from(unidades)
    .where(eq(unidades.empresaId, empresaId))
    .orderBy(asc(unidades.nome));
  return { id: empresa.id, nome: empresa.nome, orbitaTenantId: empresa.orbitaTenantId, assinaturaStatus: empresa.assinaturaStatus, unidades: lista };
}

// Busca empresas existentes (para vincular um cliente que ja usa o Quero Reservar).
integracaoOrbitaRouter.get(
  "/empresas",
  asyncHandler(async (req, res) => {
    const busca = z.string().trim().max(80).optional().parse(req.query.busca);
    const linhas = await db
      .select({ id: empresas.id, nome: empresas.nome, orbitaTenantId: empresas.orbitaTenantId })
      .from(empresas)
      .where(and(eq(empresas.ehDemo, false), busca ? ilike(empresas.nome, `%${busca}%`) : undefined))
      .orderBy(asc(empresas.nome))
      .limit(50);
    res.json(linhas);
  }),
);

integracaoOrbitaRouter.get(
  "/empresas/:id",
  asyncHandler(async (req, res) => {
    res.json(await resumoEmpresa(z.string().uuid().parse(req.params.id)));
  }),
);

const ProvisionarBody = z.object({
  orbitaTenantId: z.string().min(1).max(80),
  nome: z.string().trim().min(2).max(120),
  dono: z.object({ nome: z.string().trim().min(2).max(120), email: z.string().trim().email().max(200) }),
  unidades: z.array(z.object({ nome: z.string().trim().min(2).max(120), endereco: z.string().trim().max(250).optional() })).min(1).max(30),
});

// Cria a empresa para um cliente do Orbita. Idempotente: se ja existe empresa ligada a
// esse tenant, devolve a mesma. A cobranca e feita pelo Orbita (plano "orbita", conta
// ativa, sem assinatura Stripe por unidade).
integracaoOrbitaRouter.post(
  "/empresas",
  asyncHandler(async (req, res) => {
    const body = ProvisionarBody.parse(req.body);
    const [existente] = await db.select({ id: empresas.id }).from(empresas).where(eq(empresas.orbitaTenantId, body.orbitaTenantId)).limit(1);
    if (existente) {
      res.json(await resumoEmpresa(existente.id));
      return;
    }
    const [loginExistente] = await db.select({ empresaId: usuarios.empresaId }).from(usuarios).where(eq(usuarios.email, body.dono.email.toLowerCase())).limit(1);
    if (loginExistente) {
      throw new ConflitoError("Este e-mail ja tem conta no Quero Reservar: vincule a empresa existente em vez de criar outra.");
    }
    const empresaId = await db.transaction(async (tx) => {
      const { empresa } = await criarEmpresaComOwner(tx, {
        nomeEmpresa: body.nome,
        ownerNome: body.dono.nome,
        ownerEmail: body.dono.email,
        // o dono entra pelo Orbita; a senha pode ser definida depois por "esqueci a senha"
        ownerSenha: randomBytes(24).toString("base64url"),
        unidadeNome: body.unidades[0]!.nome,
        plano: "orbita",
      });
      await tx.update(empresas).set({ orbitaTenantId: body.orbitaTenantId, assinaturaStatus: "ativo" }).where(eq(empresas.id, empresa.id));
      if (body.unidades[0]!.endereco) {
        await tx.update(unidades).set({ endereco: body.unidades[0]!.endereco }).where(eq(unidades.empresaId, empresa.id));
      }
      for (const u of body.unidades.slice(1)) {
        const slug = await gerarSlugDisponivel(tx, derivarSlugDoNome(u.nome));
        await tx.insert(unidades).values({ empresaId: empresa.id, nome: u.nome, slug, endereco: u.endereco ?? null, timezone: "America/Sao_Paulo" });
      }
      return empresa.id;
    });
    res.status(201).json(await resumoEmpresa(empresaId));
  }),
);

// Liga uma empresa que ja usa o Quero Reservar a um cliente do Orbita.
integracaoOrbitaRouter.post(
  "/empresas/:id/vincular",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { orbitaTenantId } = z.object({ orbitaTenantId: z.string().min(1).max(80) }).parse(req.body);
    const atual = await resumoEmpresa(id);
    if (atual.orbitaTenantId && atual.orbitaTenantId !== orbitaTenantId) {
      throw new ConflitoError("Esta empresa ja esta ligada a outro cliente do Orbita.");
    }
    const [outra] = await db.select({ id: empresas.id }).from(empresas).where(eq(empresas.orbitaTenantId, orbitaTenantId)).limit(1);
    if (outra && outra.id !== id) throw new ConflitoError("Este cliente do Orbita ja esta ligado a outra empresa.");
    await db.update(empresas).set({ orbitaTenantId }).where(eq(empresas.id, id));
    res.json(await resumoEmpresa(id));
  }),
);

integracaoOrbitaRouter.delete(
  "/empresas/:id/vinculo",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    await db.update(empresas).set({ orbitaTenantId: null }).where(eq(empresas.id, id));
    res.status(204).end();
  }),
);

// Codigo de entrada (2 min) para abrir o painel ja logado como o dono, dentro do Orbita.
integracaoOrbitaRouter.post(
  "/empresas/:id/sso",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z
      .object({ unidadeId: z.string().uuid().optional(), destino: z.string().regex(/^\/admin(\/[a-z0-9-]*)*$/).optional() })
      .parse(req.body ?? {});
    const [owner] = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(and(eq(usuarios.empresaId, id), eq(usuarios.papel, "owner")))
      .orderBy(asc(usuarios.criadoEm))
      .limit(1);
    if (!owner) throw new RecursoNaoEncontradoError("Empresa (ou login de dono) nao encontrada");
    if (body.unidadeId) {
      const [u] = await db.select({ id: unidades.id }).from(unidades).where(and(eq(unidades.id, body.unidadeId), eq(unidades.empresaId, id))).limit(1);
      if (!u) throw new RequisicaoInvalidaError("Unidade nao pertence a esta empresa");
    }
    const codigo = signOrbitaSso({ sub: owner.id, empresaId: id, ...(body.unidadeId && { unidadeId: body.unidadeId }) });
    const base = (env.WEB_APP_URL ?? "").replace(/\/$/, "");
    const params = new URLSearchParams({ codigo, ...(body.destino && { destino: body.destino }) });
    res.json({ codigo, url: `${base}/entrar-orbita?${params.toString()}` });
  }),
);

// Reservas da empresa num intervalo de datas (todas as unidades), para o Orbita mostrar
// e abrir a mesa/comanda quando o cliente chega. Maximo de 62 dias por consulta.
integracaoOrbitaRouter.get(
  "/empresas/:id/reservas",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const q = z.object({ de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.query);
    if ((Date.parse(q.ate) - Date.parse(q.de)) / 86_400_000 > 62 || q.ate < q.de) {
      throw new RequisicaoInvalidaError("Intervalo de datas invalido (maximo 62 dias)");
    }
    const minhas = await db.select({ id: unidades.id }).from(unidades).where(eq(unidades.empresaId, id));
    if (minhas.length === 0) {
      res.json([]);
      return;
    }
    const linhas = await db
      .select({
        id: reservas.id,
        unidadeId: reservas.unidadeId,
        clienteNome: reservas.clienteNome,
        clienteTelefone: reservas.clienteTelefone,
        numPessoas: reservas.numPessoas,
        data: reservas.data,
        horaInicio: reservas.horaInicio,
        horaFim: reservas.horaFim,
        status: reservas.status,
        observacoes: reservas.observacoes,
        mesaFisica: reservas.mesaFisica,
        mesaNome: mesas.nome,
        salaoNome: saloes.nome,
        canalOrigem: reservas.canalOrigem,
        criadoEm: reservas.criadoEm,
      })
      .from(reservas)
      .leftJoin(mesas, eq(mesas.id, reservas.mesaId))
      .leftJoin(saloes, or(eq(saloes.id, reservas.salaoId), eq(saloes.id, mesas.salaoId)))
      .where(and(inArray(reservas.unidadeId, minhas.map((u) => u.id)), gte(reservas.data, q.de), lte(reservas.data, q.ate)))
      .orderBy(asc(reservas.data), asc(reservas.horaInicio))
      .limit(2000);
    res.json(linhas);
  }),
);

