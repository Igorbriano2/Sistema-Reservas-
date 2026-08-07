import { eq } from "drizzle-orm";
import { z, ZodError } from "zod";
import type { Database } from "../../db/client.js";
import { conversas } from "../../db/schema/index.js";
import { verificarDisponibilidade } from "../../lib/availability.js";
import { atualizarReservaDoCliente, buscarReservasDoCliente, cancelarReservaDoCliente } from "../../lib/reservations.js";
import { AppError } from "../../lib/errors.js";
import { env } from "../../config/env.js";
import { gerarTokenDeReserva } from "../../lib/reservation-link.js";
import { enviarPushParaUnidade } from "../../lib/push.js";
import type { AgentContext } from "./context.js";

export interface ToolResultado {
  output: unknown;
  isError?: boolean;
}

function erroAmigavel(err: unknown): ToolResultado {
  if (err instanceof ZodError) {
    return { output: { erro: `Parametros invalidos: ${err.issues.map((i) => i.message).join("; ")}` }, isError: true };
  }
  if (err instanceof AppError) {
    return { output: { erro: err.message }, isError: true };
  }
  throw err;
}

const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data deve estar no formato YYYY-MM-DD");
const horaSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "hora deve estar no formato HH:MM");

async function checkAvailability(db: Database, ctx: AgentContext, input: unknown): Promise<ToolResultado> {
  const { data, hora, num_pessoas } = z
    .object({ data: dataSchema, hora: horaSchema, num_pessoas: z.number().int().positive() })
    .parse(input);

  // Tool puramente informativa: nunca cria, reserva ou bloqueia nada. So diz se ha
  // (ou nao) capacidade compativel disponivel para esse horario.
  const resultado = await verificarDisponibilidade(db, { unidadeId: ctx.unidadeId, data, hora, numPessoas: num_pessoas });

  return {
    output: {
      disponivel: resultado.disponivel,
      motivo: resultado.motivo,
      hora_inicio: resultado.horaInicio,
      hora_fim: resultado.horaFim,
      mesas_disponiveis: resultado.mesasDisponiveis.length,
      // Saloes em modo "simples" (sem mesas individuais) com capacidade sobrando.
      saloes_disponiveis: resultado.saloesSimplesDisponiveis.length,
    },
  };
}

async function getReservationLink(ctx: AgentContext): Promise<ToolResultado> {
  if (!env.WEB_APP_URL) {
    return { output: { erro: "Link de reserva nao configurado nesta unidade" }, isError: true };
  }
  const token = gerarTokenDeReserva({ unidadeId: ctx.unidadeId, igSenderId: ctx.igSenderId });
  return {
    output: {
      link: `${env.WEB_APP_URL}/reservar/${token}`,
      valido_por_minutos: 60,
    },
  };
}

function formatarReserva(r: Awaited<ReturnType<typeof buscarReservasDoCliente>>[number]) {
  return {
    reservation_id: r.id,
    data: r.data,
    hora_inicio: r.horaInicio,
    hora_fim: r.horaFim,
    num_pessoas: r.numPessoas,
    status: r.status,
  };
}

async function findMyReservations(db: Database, ctx: AgentContext): Promise<ToolResultado> {
  const lista = await buscarReservasDoCliente(db, { unidadeId: ctx.unidadeId, igSenderId: ctx.igSenderId });
  return { output: { reservas: lista.map(formatarReserva) } };
}

const STATUS_ATIVOS = new Set(["pendente", "confirmada"]);

async function checkReservationStatus(db: Database, ctx: AgentContext): Promise<ToolResultado> {
  const hoje = new Date().toISOString().slice(0, 10);
  const lista = await buscarReservasDoCliente(db, { unidadeId: ctx.unidadeId, igSenderId: ctx.igSenderId });

  const futuras = lista
    .filter((r) => STATUS_ATIVOS.has(r.status) && r.data >= hoje)
    .sort((a, b) => `${a.data}${a.horaInicio}`.localeCompare(`${b.data}${b.horaInicio}`));

  if (futuras.length === 0) {
    return { output: { tem_reserva_ativa: false } };
  }
  return { output: { tem_reserva_ativa: true, proxima_reserva: formatarReserva(futuras[0]) } };
}

async function modifyMyReservation(db: Database, ctx: AgentContext, input: unknown): Promise<ToolResultado> {
  const dados = z
    .object({
      reservation_id: z.string().uuid("reservation_id invalido"),
      data: dataSchema.optional(),
      hora: horaSchema.optional(),
      num_pessoas: z.number().int().positive().optional(),
      mesa_id: z.string().uuid().optional(),
    })
    .refine(
      (d) => d.data || d.hora || d.num_pessoas || d.mesa_id,
      "informe ao menos um campo para alterar (data, hora, num_pessoas ou mesa_id)",
    )
    .parse(input);

  const reserva = await atualizarReservaDoCliente(
    db,
    { unidadeId: ctx.unidadeId, igSenderId: ctx.igSenderId, reservaId: dados.reservation_id },
    {
      data: dados.data,
      horaInicio: dados.hora,
      numPessoas: dados.num_pessoas,
      mesaId: dados.mesa_id,
    },
  );

  return { output: formatarReserva(reserva) };
}

async function cancelMyReservation(db: Database, ctx: AgentContext, input: unknown): Promise<ToolResultado> {
  const { reservation_id } = z.object({ reservation_id: z.string().uuid("reservation_id invalido") }).parse(input);

  const reserva = await cancelarReservaDoCliente(db, {
    unidadeId: ctx.unidadeId,
    igSenderId: ctx.igSenderId,
    reservaId: reservation_id,
  });

  // Avisa os dispositivos da unidade com o PWA instalado (doc 15) - cancelamento feito
  // pelo proprio cliente no chat, sem passar pelo painel.
  enviarPushParaUnidade(db, ctx.unidadeId, {
    titulo: "Reserva cancelada",
    corpo: `${reserva.clienteNome} - ${reserva.data.split("-").reverse().join("/")} as ${reserva.horaInicio.slice(0, 5)} foi cancelada pelo cliente`,
    url: "/admin/reservas",
  }).catch((err) => {
    console.error("[cancel_my_reservation] falha ao enviar push:", err);
  });

  return { output: formatarReserva(reserva) };
}

async function escalateToHuman(db: Database, ctx: AgentContext, input: unknown): Promise<ToolResultado> {
  const { motivo } = z.object({ motivo: z.string().min(1) }).parse(input);

  await db.update(conversas).set({ agentPaused: true }).where(eq(conversas.id, ctx.conversaId));

  return { output: { encaminhado: true, motivo } };
}

export async function executarTool(
  db: Database,
  ctx: AgentContext,
  nomeDaTool: string,
  input: unknown,
): Promise<ToolResultado> {
  try {
    switch (nomeDaTool) {
      case "check_availability":
        return await checkAvailability(db, ctx, input);
      case "get_reservation_link":
        return await getReservationLink(ctx);
      case "find_my_reservations":
        return await findMyReservations(db, ctx);
      case "modify_my_reservation":
        return await modifyMyReservation(db, ctx, input);
      case "cancel_my_reservation":
        return await cancelMyReservation(db, ctx, input);
      case "check_reservation_status":
        return await checkReservationStatus(db, ctx);
      case "escalate_to_human":
        return await escalateToHuman(db, ctx, input);
      default:
        return { output: { erro: `Tool desconhecida: ${nomeDaTool}` }, isError: true };
    }
  } catch (err) {
    return erroAmigavel(err);
  }
}
