import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Response } from "express";
import { db } from "../../db/client.js";
import { conversas, unidades } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { decodificarTokenDeReserva, TokenDeReservaInvalidoError } from "../../lib/reservation-link.js";
import { criarReservaComMesaAutomatica } from "../../lib/reservations.js";
import { enviarRespostaDoAgente } from "../../lib/instagram-notify.js";

// Rotas PUBLICAS (sem requireAuth) - a seguranca aqui e o proprio token assinado e de
// curta duracao (ver lib/reservation-link.ts), nao um JWT de sessao de admin. unidade_id
// e ig_sender_id vem SEMPRE do token decodificado no backend, nunca do corpo da
// requisicao - a mesma regra de isolamento aplicada nas tools do agente vale aqui.
export const reservationLinkRouter = Router();

function responderTokenInvalido(res: Response): void {
  res.status(410).json({ error: "Este link expirou ou e invalido. Peca um novo link ao atendente no Instagram." });
}

reservationLinkRouter.get(
  "/:token",
  asyncHandler(async (req, res) => {
    let payload;
    try {
      payload = decodificarTokenDeReserva(req.params.token);
    } catch (err) {
      if (err instanceof TokenDeReservaInvalidoError) return responderTokenInvalido(res);
      throw err;
    }

    const [unidade] = await db
      .select({ id: unidades.id, nome: unidades.nome, timezone: unidades.timezone })
      .from(unidades)
      .where(eq(unidades.id, payload.unidadeId))
      .limit(1);

    if (!unidade) return responderTokenInvalido(res);

    res.json({ unidadeNome: unidade.nome, timezone: unidade.timezone });
  }),
);

const criarReservaPublicaSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data deve estar no formato YYYY-MM-DD"),
  horaInicio: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "horario deve estar no formato HH:MM"),
  numPessoas: z.number().int().positive(),
  clienteNome: z.string().min(1),
  clienteTelefone: z.string().optional(),
});

reservationLinkRouter.post(
  "/:token/reservations",
  asyncHandler(async (req, res) => {
    let payload;
    try {
      payload = decodificarTokenDeReserva(req.params.token);
    } catch (err) {
      if (err instanceof TokenDeReservaInvalidoError) return responderTokenInvalido(res);
      throw err;
    }

    // Body so pode alterar OS PROPRIOS dados da reserva; unidadeId/igSenderId vem
    // exclusivamente do token, entao mesmo que o body tente incluir esses campos
    // (o schema nem os declara), eles sao ignorados.
    const dados = criarReservaPublicaSchema.parse(req.body);

    const reserva = await criarReservaComMesaAutomatica(db, {
      unidadeId: payload.unidadeId,
      igSenderId: payload.igSenderId,
      ...dados,
    });

    const [conversa] = await db
      .select({ id: conversas.id })
      .from(conversas)
      .where(and(eq(conversas.unidadeId, payload.unidadeId), eq(conversas.igSenderId, payload.igSenderId)))
      .limit(1);

    if (conversa) {
      const texto =
        `Reserva confirmada para ${reserva.data.split("-").reverse().join("/")} as ` +
        `${reserva.horaInicio.slice(0, 5)}, para ${reserva.numPessoas} pessoa(s). Ate breve!`;
      await enviarRespostaDoAgente(db, {
        unidadeId: payload.unidadeId,
        igSenderId: payload.igSenderId,
        conversaId: conversa.id,
        texto,
      }).catch((err) => {
        console.error("[reserva-publica] falha ao notificar cliente no Instagram:", err);
      });
    }

    res.status(201).json({
      id: reserva.id,
      data: reserva.data,
      horaInicio: reserva.horaInicio,
      horaFim: reserva.horaFim,
      numPessoas: reserva.numPessoas,
      status: reserva.status,
    });
  }),
);
