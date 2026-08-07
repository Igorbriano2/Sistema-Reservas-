import { Router } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { filaEspera, filaEsperaStatusEnum, unidades } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { RecursoNaoEncontradoError } from "../../lib/errors.js";
import { env } from "../../config/env.js";
import { decrypt } from "../../lib/crypto.js";
import { enviarTemplateWhatsapp } from "../../lib/whatsapp-api.js";
import { conexaoAtivaDaEmpresa } from "../../lib/whatsapp-scheduler.js";

export const filaEsperaRouter = Router({ mergeParams: true });

const STATUS_ATIVOS = ["esperando", "chamado"] as const;

const criarEntradaSchema = z.object({
  clienteNome: z.string().min(1),
  clienteTelefone: z.string().min(1).optional(),
  numPessoas: z.number().int().positive(),
  observacoes: z.string().optional(),
});

const atualizarStatusSchema = z.object({
  status: z.enum(filaEsperaStatusEnum.enumValues),
});

// Best-effort: se nao houver conexao WhatsApp ativa ou o envio falhar, so loga - o
// dono ainda pode avisar o cliente pessoalmente, entao isso nunca deve travar a
// mudanca de status na tela.
async function avisarClienteQueMesaEstaPronta(empresaId: string, unidadeId: string, telefone: string): Promise<void> {
  try {
    const conexao = await conexaoAtivaDaEmpresa(db, empresaId, unidadeId);
    if (!conexao || !env.TOKEN_ENCRYPTION_KEY) return;
    const accessToken = decrypt(conexao.accessTokenEncrypted, env.TOKEN_ENCRYPTION_KEY);
    await enviarTemplateWhatsapp({
      accessToken,
      phoneNumberId: conexao.phoneNumberId,
      telefoneDestino: telefone,
      nomeDoTemplate: env.WHATSAPP_TEMPLATE_FILA_ESPERA,
      idioma: env.WHATSAPP_TEMPLATE_LANG,
    });
  } catch (err) {
    console.error("[fila-espera] falha ao avisar cliente pelo WhatsApp:", err);
  }
}

filaEsperaRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const somenteAtivos = req.query.todos !== "true";
    const lista = await db
      .select()
      .from(filaEspera)
      .where(
        somenteAtivos
          ? and(eq(filaEspera.unidadeId, req.unidadeId!), inArray(filaEspera.status, [...STATUS_ATIVOS]))
          : eq(filaEspera.unidadeId, req.unidadeId!),
      )
      .orderBy(asc(filaEspera.criadoEm));
    res.json(lista);
  }),
);

filaEsperaRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const dados = criarEntradaSchema.parse(req.body);
    const [entrada] = await db
      .insert(filaEspera)
      .values({ unidadeId: req.unidadeId!, ...dados })
      .returning();
    res.status(201).json(entrada);
  }),
);

filaEsperaRouter.patch(
  "/:entradaId/status",
  asyncHandler(async (req, res) => {
    const { status } = atualizarStatusSchema.parse(req.body);

    const [entradaAtual] = await db
      .select()
      .from(filaEspera)
      .where(and(eq(filaEspera.id, req.params.entradaId), eq(filaEspera.unidadeId, req.unidadeId!)))
      .limit(1);
    if (!entradaAtual) throw new RecursoNaoEncontradoError("Fila de espera - entrada nao encontrada");

    const agora = new Date();
    const [entrada] = await db
      .update(filaEspera)
      .set({
        status,
        chamadoEm: status === "chamado" ? agora : entradaAtual.chamadoEm,
        finalizadoEm: status === "sentado" || status === "desistiu" ? agora : entradaAtual.finalizadoEm,
      })
      .where(eq(filaEspera.id, req.params.entradaId))
      .returning();

    if (status === "chamado" && entrada.clienteTelefone) {
      const [unidade] = await db.select({ empresaId: unidades.empresaId }).from(unidades).where(eq(unidades.id, req.unidadeId!)).limit(1);
      if (unidade) {
        avisarClienteQueMesaEstaPronta(unidade.empresaId, req.unidadeId!, entrada.clienteTelefone).catch(() => {});
      }
    }

    res.json(entrada);
  }),
);

filaEsperaRouter.delete(
  "/:entradaId",
  asyncHandler(async (req, res) => {
    const [entrada] = await db
      .delete(filaEspera)
      .where(and(eq(filaEspera.id, req.params.entradaId), eq(filaEspera.unidadeId, req.unidadeId!)))
      .returning();
    if (!entrada) throw new RecursoNaoEncontradoError("Fila de espera - entrada nao encontrada");
    res.status(204).send();
  }),
);
