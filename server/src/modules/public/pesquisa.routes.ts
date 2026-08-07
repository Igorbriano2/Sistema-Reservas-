import { Router } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Response } from "express";
import { db } from "../../db/client.js";
import { feedbacks, pesquisaPerguntas, pesquisaRespostas, reservas, unidades } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { decodificarTokenDePesquisa, TokenDePesquisaInvalidoError } from "../../lib/pesquisa-link.js";
import { RequisicaoInvalidaError } from "../../lib/errors.js";

// Rota PUBLICA (sem requireAuth) - pagina de pesquisa de satisfacao customizada (doc
// 21), aberta pelo link enviado por WhatsApp apos a reserva. Mesmo esquema de
// seguranca de reservation-link.routes.ts: token assinado de curta duracao, nunca
// confia em empresaId/reservaId vindos do corpo.
export const pesquisaPublicRouter = Router();

function responderTokenInvalido(res: Response): void {
  res.status(410).json({ error: "Este link expirou ou e invalido." });
}

pesquisaPublicRouter.get(
  "/:token",
  asyncHandler(async (req, res) => {
    let payload;
    try {
      payload = decodificarTokenDePesquisa(req.params.token);
    } catch (err) {
      if (err instanceof TokenDePesquisaInvalidoError) return responderTokenInvalido(res);
      throw err;
    }

    const [reserva] = await db
      .select({ unidadeNome: unidades.nome })
      .from(reservas)
      .innerJoin(unidades, eq(unidades.id, reservas.unidadeId))
      .where(eq(reservas.id, payload.reservaId))
      .limit(1);
    if (!reserva) return responderTokenInvalido(res);

    const [feedbackExistente] = await db
      .select({ id: feedbacks.id })
      .from(feedbacks)
      .where(eq(feedbacks.reservaId, payload.reservaId))
      .limit(1);
    const jaRespondida = feedbackExistente
      ? (await db.select().from(pesquisaRespostas).where(eq(pesquisaRespostas.feedbackId, feedbackExistente.id)).limit(1)).length > 0
      : false;

    const perguntas = await db
      .select({ id: pesquisaPerguntas.id, tipo: pesquisaPerguntas.tipo, texto: pesquisaPerguntas.texto })
      .from(pesquisaPerguntas)
      .where(and(eq(pesquisaPerguntas.empresaId, payload.empresaId), eq(pesquisaPerguntas.ativa, true)))
      .orderBy(pesquisaPerguntas.ordem);

    res.json({ unidadeNome: reserva.unidadeNome, jaRespondida, perguntas });
  }),
);

const respostaSchema = z.object({
  perguntaId: z.string().uuid(),
  valorEscala: z.number().int().min(1).max(5).optional(),
  valorTexto: z.string().min(1).optional(),
});

const enviarRespostasSchema = z
  .object({ respostas: z.array(respostaSchema).min(1) })
  .refine((d) => d.respostas.every((r) => r.valorEscala != null || r.valorTexto != null), "Cada resposta precisa de um valor");

pesquisaPublicRouter.post(
  "/:token",
  asyncHandler(async (req, res) => {
    let payload;
    try {
      payload = decodificarTokenDePesquisa(req.params.token);
    } catch (err) {
      if (err instanceof TokenDePesquisaInvalidoError) return responderTokenInvalido(res);
      throw err;
    }

    const dados = enviarRespostasSchema.parse(req.body);

    // Confere que toda pergunta respondida pertence MESMO a empresa do token - nunca
    // confia nos ids vindos do corpo sem validar (mesma regra de isolamento de sempre).
    const idsDasPerguntas = dados.respostas.map((r) => r.perguntaId);
    const perguntasValidas = await db
      .select({ id: pesquisaPerguntas.id })
      .from(pesquisaPerguntas)
      .where(and(eq(pesquisaPerguntas.empresaId, payload.empresaId), inArray(pesquisaPerguntas.id, idsDasPerguntas)));
    if (perguntasValidas.length !== new Set(idsDasPerguntas).size) {
      throw new RequisicaoInvalidaError("Uma ou mais perguntas nao pertencem a esta pesquisa");
    }

    let [feedback] = await db.select().from(feedbacks).where(eq(feedbacks.reservaId, payload.reservaId)).limit(1);
    if (feedback) {
      const [jaTemResposta] = await db.select().from(pesquisaRespostas).where(eq(pesquisaRespostas.feedbackId, feedback.id)).limit(1);
      if (jaTemResposta) {
        throw new RequisicaoInvalidaError("Esta pesquisa ja foi respondida");
      }
    } else {
      [feedback] = await db
        .insert(feedbacks)
        .values({ reservaId: payload.reservaId, empresaId: payload.empresaId, clienteTelefone: payload.clienteTelefone })
        .returning();
    }

    await db.insert(pesquisaRespostas).values(
      dados.respostas.map((r) => ({
        feedbackId: feedback.id,
        perguntaId: r.perguntaId,
        valorEscala: r.valorEscala,
        valorTexto: r.valorTexto,
      })),
    );

    res.status(201).json({ respondida: true });
  }),
);
