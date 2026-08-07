import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { assinaturas, empresas } from "../db/schema/index.js";
import { env } from "../config/env.js";

// Requer requireAuth antes (usa req.auth.empresaId). Bloqueia o restante do /admin
// quando a assinatura da empresa nao esta em dia - a tela de assinatura em si
// (/admin/assinatura) fica montada ANTES deste middleware em modules/admin/index.ts,
// pra o dono sempre conseguir ver o proprio status e cancelar mesmo bloqueado.
export async function requireAssinaturaAtiva(req: Request, res: Response, next: NextFunction): Promise<void> {
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

  // O status MANUAL (editado a mao no /painel da plataforma) sempre vence o que a
  // Stripe diz - e a forma do dono da plataforma suspender/cancelar um cliente por
  // qualquer motivo (ex: abuso), mesmo com a assinatura em dia na Stripe.
  if (empresa.assinaturaStatus === "cancelado" || empresa.assinaturaStatus === "suspenso") {
    res.status(402).json({ error: "Sua conta esta inativa. Entre em contato com o suporte.", motivo: "manual" });
    return;
  }

  const [assinatura] = await db.select().from(assinaturas).where(eq(assinaturas.empresaId, empresaId)).limit(1);
  // Empresa sem nenhuma linha de assinatura (seed, modo teste, conversao de lead
  // antiga - de antes da integracao Stripe) nao tem o que checar aqui: libera.
  if (!assinatura) {
    next();
    return;
  }

  if (assinatura.status === "cancelada") {
    res.status(402).json({ error: "Sua assinatura foi cancelada.", motivo: "cancelada" });
    return;
  }

  if (assinatura.status === "atrasada" && assinatura.atrasadaDesde) {
    const diasAtraso = (Date.now() - assinatura.atrasadaDesde.getTime()) / 86_400_000;
    if (diasAtraso > env.ASSINATURA_ATRASO_GRACE_DIAS) {
      res.status(402).json({ error: "Pagamento atrasado. Regularize para continuar usando o painel.", motivo: "atrasada" });
      return;
    }
    // Dentro do periodo de graca: libera, mas avisa o frontend (banner) via header.
    res.setHeader("X-Assinatura-Aviso", "atrasada");
  }

  next();
}
