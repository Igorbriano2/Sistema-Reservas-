import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { assinaturas, empresas } from "../db/schema/index.js";
import { env } from "../config/env.js";

// Requer requireAuth antes (usa req.auth.empresaId). So checa o status MANUAL
// (editado a mao no /painel da plataforma) - e a forma do dono da plataforma
// suspender/cancelar a CONTA INTEIRA por qualquer motivo (ex: abuso), independente do
// que a Stripe diz em cada unidade. Bloqueia o /admin inteiro (kill switch de conta),
// diferente do bloqueio por assinatura da Stripe, que e por unidade (ver
// requireAssinaturaDaUnidadeAtiva) - a tela de assinatura em si (/admin/assinatura)
// fica montada ANTES deste middleware em modules/admin/index.ts, pra o dono sempre
// conseguir ver o proprio status e cancelar mesmo bloqueado.
export async function requireContaAtiva(req: Request, res: Response, next: NextFunction): Promise<void> {
  const empresaId = req.auth?.empresaId;
  if (!empresaId) {
    next();
    return;
  }

  const [empresa] = await db
    .select({ assinaturaStatus: empresas.assinaturaStatus })
    .from(empresas)
    .where(eq(empresas.id, empresaId))
    .limit(1);
  if (!empresa) {
    res.status(404).json({ error: "Empresa nao encontrada" });
    return;
  }

  if (empresa.assinaturaStatus === "cancelado" || empresa.assinaturaStatus === "suspenso") {
    res.status(402).json({ error: "Sua conta esta inativa. Entre em contato com o suporte.", motivo: "manual" });
    return;
  }

  next();
}

// Requer requireAuth + resolveUnidade antes (usa req.unidadeId). Doc 17, parte 5: o
// plano e cobrado por UNIDADE (uma assinatura Stripe por loja), entao o bloqueio
// tambem e por unidade - uma loja atrasada/cancelada nao derruba as demais lojas da
// mesma empresa, so as rotas daquela unidade especifica (reservas, mesas, saloes,
// etc; ver mount em modules/admin/index.ts).
export async function requireAssinaturaDaUnidadeAtiva(req: Request, res: Response, next: NextFunction): Promise<void> {
  const unidadeId = req.unidadeId;
  if (!unidadeId) {
    next();
    return;
  }

  const [assinatura] = await db.select().from(assinaturas).where(eq(assinaturas.unidadeId, unidadeId)).limit(1);
  // Unidade sem nenhuma linha de assinatura (seed, modo teste, ou empresa criada antes
  // da integracao Stripe) nao tem o que checar aqui: libera.
  if (!assinatura) {
    next();
    return;
  }

  if (assinatura.status === "cancelada") {
    res.status(402).json({ error: "A assinatura desta unidade foi cancelada.", motivo: "cancelada" });
    return;
  }

  if (assinatura.status === "atrasada" && assinatura.atrasadaDesde) {
    const diasAtraso = (Date.now() - assinatura.atrasadaDesde.getTime()) / 86_400_000;
    if (diasAtraso > env.ASSINATURA_ATRASO_GRACE_DIAS) {
      res.status(402).json({ error: "Pagamento atrasado. Regularize para continuar usando esta unidade.", motivo: "atrasada" });
      return;
    }
    // Dentro do periodo de graca: libera, mas avisa o frontend (banner) via header.
    res.setHeader("X-Assinatura-Aviso", "atrasada");
  }

  next();
}
