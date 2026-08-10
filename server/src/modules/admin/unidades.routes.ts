import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { unidades, usuarioUnidades } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { requireRole } from "../../middleware/auth.middleware.js";
import { adicionarUnidadeComAssinatura } from "../../lib/unidades.js";
import { obterStripe, resolverPriceId } from "../../lib/stripe.js";
import { env } from "../../config/env.js";
import { RecursoNaoEncontradoError } from "../../lib/errors.js";

export const unidadesRouter = Router();

// Lista as unidades da propria empresa do usuario logado - usado pelo frontend admin
// para descobrir qual unidade_id usar nas demais rotas. Owner ve todas (acesso
// implicito); gerente/funcionario so veem as lojas as quais o dono deu acesso na hora
// de criar o login (doc 17) - senao a tela mostraria uma loja que a API depois barra
// com 403 quando o usuario tentasse selecionar.
unidadesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    if (req.auth!.papel === "owner") {
      const lista = await db.select().from(unidades).where(eq(unidades.empresaId, req.auth!.empresaId));
      res.json(lista);
      return;
    }

    // Inclui permissoesExtra de cada unidade - o frontend usa isso pra saber quais
    // telas mostrar pra esse gerente/funcionario, sem precisar de outro endpoint.
    const lista = await db
      .select({
        id: unidades.id,
        empresaId: unidades.empresaId,
        nome: unidades.nome,
        endereco: unidades.endereco,
        telefone: unidades.telefone,
        contatoUrgenciaNome: unidades.contatoUrgenciaNome,
        contatoUrgenciaTelefone: unidades.contatoUrgenciaTelefone,
        redesSociais: unidades.redesSociais,
        timezone: unidades.timezone,
        permissoesExtra: usuarioUnidades.permissoesExtra,
      })
      .from(unidades)
      .innerJoin(usuarioUnidades, eq(usuarioUnidades.unidadeId, unidades.id))
      .where(and(eq(unidades.empresaId, req.auth!.empresaId), eq(usuarioUnidades.usuarioId, req.auth!.sub)));
    res.json(lista);
  }),
);

const criarUnidadeSchema = z.object({
  nome: z.string().trim().min(1),
  endereco: z.string().trim().min(1).optional(),
  timezone: z.string().trim().min(1).optional(),
  // Gerado no navegador via Stripe Elements (stripe.createPaymentMethod), igual ao
  // checkout publico - o numero do cartao em si nunca chega neste backend.
  paymentMethodId: z.string().trim().min(1),
});

// Fluxo "adicionar unidade" (doc 17, parte 3) - so o dono cria/paga por unidade nova
// (ver tabela de permissoes do doc), nunca gerente/funcionario mesmo com
// "criar_usuarios" (essa permissao e so pra logins, nao pra lojas/cobranca).
unidadesRouter.post(
  "/",
  requireRole("owner"),
  asyncHandler(async (req, res) => {
    const dados = criarUnidadeSchema.parse(req.body);
    const stripe = obterStripe();
    const priceId = await resolverPriceId(stripe, {
      productId: env.STRIPE_PRODUCT_ID,
      priceIdConfigurado: env.STRIPE_PRICE_ID,
    });
    const { unidade } = await adicionarUnidadeComAssinatura(db, stripe, priceId, req.auth!.empresaId, dados);
    res.status(201).json(unidade);
  }),
);

const redeSocialSchema = z.object({ rede: z.string().trim().min(1), link: z.string().trim().min(1) });

const atualizarUnidadeSchema = z
  .object({
    endereco: z.string().trim().transform((v) => v || null).nullable(),
    telefone: z.string().trim().transform((v) => v || null).nullable(),
    contatoUrgenciaNome: z.string().trim().transform((v) => v || null).nullable(),
    contatoUrgenciaTelefone: z.string().trim().transform((v) => v || null).nullable(),
    redesSociais: z.array(redeSocialSchema),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Informe ao menos um campo para atualizar");

// Dados de contato/presenca (doc 24 - agente de IA obrigatoriamente informado) - so o
// dono edita (mesma tela ownerOnly de "Unidades" no menu), qualquer unidade da propria
// empresa, nao so a selecionada no momento.
unidadesRouter.patch(
  "/:unidadeId",
  requireRole("owner"),
  asyncHandler(async (req, res) => {
    const dados = atualizarUnidadeSchema.parse(req.body);
    const [atualizada] = await db
      .update(unidades)
      .set(dados)
      .where(and(eq(unidades.id, req.params.unidadeId), eq(unidades.empresaId, req.auth!.empresaId)))
      .returning();
    if (!atualizada) throw new RecursoNaoEncontradoError("Unidade nao encontrada");
    res.json(atualizada);
  }),
);
