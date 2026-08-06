import { Router } from "express";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { reservaStatusEnum, reservas } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { RequisicaoInvalidaError } from "../../lib/errors.js";
import { atualizarReservaDaUnidade, cancelarReservaDaUnidade, criarReserva } from "../../lib/reservations.js";

export const reservationsRouter = Router({ mergeParams: true });

const horaSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use o formato HH:MM");
const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato YYYY-MM-DD");

// "data" filtra um dia exato (usado pelo painel operacional); "dataInicio"/"dataFim"
// filtram um periodo (usado pelo dashboard gerencial) - mutuamente exclusivos.
const listarQuerySchema = z.object({
  data: dataSchema.optional(),
  dataInicio: dataSchema.optional(),
  dataFim: dataSchema.optional(),
});

const criarReservaSchema = z.object({
  mesaId: z.string().uuid(),
  data: dataSchema,
  horaInicio: horaSchema,
  horaFim: horaSchema.optional(),
  numPessoas: z.number().int().positive(),
  clienteNome: z.string().min(1),
  clienteTelefone: z.string().optional(),
  observacoes: z.string().optional(),
});

const atualizarReservaSchema = z
  .object({
    mesaId: z.string().uuid().optional(),
    data: dataSchema.optional(),
    horaInicio: horaSchema.optional(),
    horaFim: horaSchema.optional(),
    numPessoas: z.number().int().positive().optional(),
    clienteNome: z.string().min(1).optional(),
    clienteTelefone: z.string().optional(),
    observacoes: z.string().optional(),
    status: z.enum(reservaStatusEnum.enumValues).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "Informe ao menos um campo para atualizar");

reservationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = listarQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new RequisicaoInvalidaError("Parametros invalidos");
    }
    const condicoes = [eq(reservas.unidadeId, req.unidadeId!)];
    if (parsed.data.data) {
      condicoes.push(eq(reservas.data, parsed.data.data));
    }
    if (parsed.data.dataInicio) {
      condicoes.push(gte(reservas.data, parsed.data.dataInicio));
    }
    if (parsed.data.dataFim) {
      condicoes.push(lte(reservas.data, parsed.data.dataFim));
    }
    const lista = await db
      .select()
      .from(reservas)
      .where(and(...condicoes))
      .orderBy(asc(reservas.data), asc(reservas.horaInicio));
    res.json(lista);
  }),
);

reservationsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const dados = criarReservaSchema.parse(req.body);
    const reserva = await criarReserva(db, {
      unidadeId: req.unidadeId!,
      canalOrigem: "manual",
      ...dados,
    });
    res.status(201).json(reserva);
  }),
);

reservationsRouter.patch(
  "/:reservationId",
  asyncHandler(async (req, res) => {
    const dados = atualizarReservaSchema.parse(req.body);
    const reserva = await atualizarReservaDaUnidade(db, req.unidadeId!, req.params.reservationId, dados);
    res.json(reserva);
  }),
);

reservationsRouter.delete(
  "/:reservationId",
  asyncHandler(async (req, res) => {
    const reserva = await cancelarReservaDaUnidade(db, req.unidadeId!, req.params.reservationId);
    res.json(reserva);
  }),
);
