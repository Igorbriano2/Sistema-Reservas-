import { and, eq } from "drizzle-orm";
import { z, ZodError } from "zod";
import type { Database } from "../../db/client.js";
import { cardapioCategorias, cardapioItens, conversas, unidades } from "../../db/schema/index.js";
import { verificarDisponibilidade } from "../../lib/availability.js";
import { agoraNoFuso } from "../../lib/time.js";
import { resolverTierDoRodizio } from "../../lib/feriados.js";
import { atualizarReservaDoCliente, buscarReservasDoCliente, cancelarReservaDoCliente } from "../../lib/reservations.js";
import { AppError, RequisicaoInvalidaError } from "../../lib/errors.js";
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

// Todas as tools de reserva/disponibilidade abaixo so ficam visiveis pro modelo
// depois que a unidade da conversa esta resolvida (ver obterToolsDoAgente) - este
// guard e so uma rede de seguranca contra o modelo tentar chama-las antes disso.
function unidadeResolvida(ctx: AgentContext): string {
  if (!ctx.unidadeId) {
    throw new RequisicaoInvalidaError("Esta conversa ainda nao tem uma unidade definida");
  }
  return ctx.unidadeId;
}

async function checkAvailability(db: Database, ctx: AgentContext, input: unknown): Promise<ToolResultado> {
  const { data, hora, num_pessoas } = z
    .object({ data: dataSchema, hora: horaSchema, num_pessoas: z.number().int().positive() })
    .parse(input);

  // Tool puramente informativa: nunca cria, reserva ou bloqueia nada. So diz se ha
  // (ou nao) capacidade compativel disponivel para esse horario.
  const resultado = await verificarDisponibilidade(db, { unidadeId: unidadeResolvida(ctx), data, hora, numPessoas: num_pessoas });

  return {
    output: {
      disponivel: resultado.disponivel,
      motivo: resultado.motivo,
      hora_inicio: resultado.horaInicio,
      hora_fim: resultado.horaFim,
      mesas_disponiveis: resultado.mesasDisponiveis.length,
      // Saloes em modo "simples" (sem mesas individuais) com capacidade sobrando.
      saloes_disponiveis: resultado.saloesSimplesDisponiveis.length,
      // Turno (doc 19), quando o horario cai num turno nomeado/com desconto -
      // use pra mencionar o nome do turno ou um desconto ativo ao cliente.
      turno_nome: resultado.turno?.nome ?? null,
      turno_desconto_percentual: resultado.turno?.descontoPercentual ?? null,
    },
  };
}

async function getReservationLink(ctx: AgentContext): Promise<ToolResultado> {
  if (!env.WEB_APP_URL) {
    return { output: { erro: "Link de reserva nao configurado nesta unidade" }, isError: true };
  }
  const token = gerarTokenDeReserva({ unidadeId: unidadeResolvida(ctx), igSenderId: ctx.igSenderId });
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
  const lista = await buscarReservasDoCliente(db, { unidadeId: unidadeResolvida(ctx), igSenderId: ctx.igSenderId });
  return { output: { reservas: lista.map(formatarReserva) } };
}

const STATUS_ATIVOS = new Set(["pendente", "confirmada"]);

async function checkReservationStatus(db: Database, ctx: AgentContext): Promise<ToolResultado> {
  const unidadeId = unidadeResolvida(ctx);
  // "Hoje" no fuso da UNIDADE, nao do servidor - senao uma reserva pra hoje a noite
  // some da lista horas antes de acontecer de verdade (unidades America/Sao_Paulo,
  // UTC-3: as 21h locais o relogio UTC do servidor ja mostra o dia seguinte).
  const [unidadeRow] = await db.select({ timezone: unidades.timezone }).from(unidades).where(eq(unidades.id, unidadeId)).limit(1);
  const hoje = agoraNoFuso(unidadeRow?.timezone ?? "America/Sao_Paulo").data;
  const lista = await buscarReservasDoCliente(db, { unidadeId, igSenderId: ctx.igSenderId });

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
    { unidadeId: unidadeResolvida(ctx), igSenderId: ctx.igSenderId, reservaId: dados.reservation_id },
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
  const unidadeId = unidadeResolvida(ctx);

  const reserva = await cancelarReservaDoCliente(db, {
    unidadeId,
    igSenderId: ctx.igSenderId,
    reservaId: reservation_id,
  });

  // Avisa os dispositivos da unidade com o PWA instalado (doc 15) - cancelamento feito
  // pelo proprio cliente no chat, sem passar pelo painel.
  enviarPushParaUnidade(db, unidadeId, {
    titulo: "Reserva cancelada",
    corpo: `${reserva.clienteNome} - ${reserva.data.split("-").reverse().join("/")} as ${reserva.horaInicio.slice(0, 5)} foi cancelada pelo cliente`,
    url: "/admin/reservas",
  }).catch((err) => {
    console.error("[cancel_my_reservation] falha ao enviar push:", err);
  });

  return { output: formatarReserva(reserva) };
}

async function getMenu(db: Database, ctx: AgentContext): Promise<ToolResultado> {
  const unidadeId = unidadeResolvida(ctx);

  const categoriasAtivas = await db
    .select({ id: cardapioCategorias.id, nome: cardapioCategorias.nome, ordem: cardapioCategorias.ordem })
    .from(cardapioCategorias)
    .where(and(eq(cardapioCategorias.unidadeId, unidadeId), eq(cardapioCategorias.ativo, true)));

  if (categoriasAtivas.length === 0) {
    return { output: { cardapio_disponivel: false } };
  }

  const itens = await db
    .select({
      categoriaId: cardapioItens.categoriaId,
      nome: cardapioItens.nome,
      descricao: cardapioItens.descricao,
      precoCentavos: cardapioItens.precoCentavos,
      porcaoServePessoas: cardapioItens.porcaoServePessoas,
      somenteMaiorIdade: cardapioItens.somenteMaiorIdade,
      tags: cardapioItens.tags,
    })
    .from(cardapioItens)
    .innerJoin(cardapioCategorias, eq(cardapioItens.categoriaId, cardapioCategorias.id))
    .where(and(eq(cardapioCategorias.unidadeId, unidadeId), eq(cardapioItens.ativo, true)));

  const categorias = categoriasAtivas
    .sort((a, b) => a.ordem - b.ordem)
    .map((categoria) => ({
      categoria: categoria.nome,
      itens: itens
        .filter((item) => item.categoriaId === categoria.id)
        .map((item) => ({
          nome: item.nome,
          descricao: item.descricao,
          preco: `R$ ${(item.precoCentavos / 100).toFixed(2).replace(".", ",")}`,
          serve_ate_pessoas: item.porcaoServePessoas,
          somente_maior_idade: item.somenteMaiorIdade,
          tags: item.tags ?? [],
        })),
    }));

  return { output: { cardapio_disponivel: true, categorias } };
}

const TAG_ADULTO_DIA_UTIL = "rodizio_adulto_dia_util";
const TAG_ADULTO_FIM_DE_SEMANA = "rodizio_adulto_fim_de_semana_feriado";
const TAG_CRIANCA_DIA_UTIL = "rodizio_crianca_dia_util";
const TAG_CRIANCA_FIM_DE_SEMANA = "rodizio_crianca_fim_de_semana_feriado";

function formatarPreco(centavos: number): string {
  return `R$ ${(centavos / 100).toFixed(2).replace(".", ",")}`;
}

// Doc 26: o valor do rodizio muda por dia (dia util x fim de semana/feriado, incluindo
// vespera de feriado e feriado municipal) - em vez do modelo tentar calcular isso
// sozinho (data e calendario de feriado nao sao coisa que ele deva "adivinhar", ver
// REGRAS_FIXAS_DO_MASTER), esta tool resolve o dia certo no backend e devolve so o
// preco ja aplicavel, buscado nos itens do cardapio marcados com a tag correspondente
// (ver cardapio.routes.ts / tela de cardapio - tags "rodizio_adulto_dia_util" etc.).
async function checkRodizioPrice(db: Database, ctx: AgentContext, input: unknown): Promise<ToolResultado> {
  const unidadeId = unidadeResolvida(ctx);
  const { data } = z.object({ data: dataSchema.optional() }).parse(input ?? {});

  const [unidadeRow] = await db.select({ timezone: unidades.timezone }).from(unidades).where(eq(unidades.id, unidadeId)).limit(1);
  const dataAlvo = data ?? agoraNoFuso(unidadeRow?.timezone ?? "America/Sao_Paulo").data;

  const { tier, motivo } = await resolverTierDoRodizio(db, unidadeId, dataAlvo);
  const tagAdulto = tier === "dia_util" ? TAG_ADULTO_DIA_UTIL : TAG_ADULTO_FIM_DE_SEMANA;
  const tagCrianca = tier === "dia_util" ? TAG_CRIANCA_DIA_UTIL : TAG_CRIANCA_FIM_DE_SEMANA;

  const itens = await db
    .select({ nome: cardapioItens.nome, precoCentavos: cardapioItens.precoCentavos, tags: cardapioItens.tags })
    .from(cardapioItens)
    .innerJoin(cardapioCategorias, eq(cardapioItens.categoriaId, cardapioCategorias.id))
    .where(and(eq(cardapioCategorias.unidadeId, unidadeId), eq(cardapioItens.ativo, true)));

  const itemAdulto = itens.find((i) => (i.tags ?? []).includes(tagAdulto));
  const itemCrianca = itens.find((i) => (i.tags ?? []).includes(tagCrianca));

  if (!itemAdulto) {
    return { output: { rodizio_configurado: false, erro: "Nao ha preco de rodizio configurado no cardapio desta unidade" }, isError: true };
  }

  return {
    output: {
      rodizio_configurado: true,
      data: dataAlvo,
      dia_util_ou_fim_de_semana: tier,
      motivo,
      preco_adulto: formatarPreco(itemAdulto.precoCentavos),
      preco_crianca: itemCrianca ? formatarPreco(itemCrianca.precoCentavos) : null,
    },
  };
}

// Doc 17, parte 4: so chamada quando ctx.unidadeId ainda e nulo (conexao
// compartilhada, unidade ainda nao resolvida). Valida que o id escolhido pertence
// MESMO a empresa da conversa antes de gravar - o modelo recebe a lista de unidades
// no system prompt, mas nunca confiamos cegamente num id que ele devolveu.
async function resolverUnidadeDaConversa(db: Database, ctx: AgentContext, input: unknown): Promise<ToolResultado> {
  const { unidade_id } = z.object({ unidade_id: z.string().uuid("unidade_id invalido") }).parse(input);

  const [unidade] = await db
    .select({ id: unidades.id, nome: unidades.nome })
    .from(unidades)
    .where(and(eq(unidades.id, unidade_id), eq(unidades.empresaId, ctx.empresaId)))
    .limit(1);
  if (!unidade) {
    return { output: { erro: "unidade_id nao corresponde a nenhuma unidade valida" }, isError: true };
  }

  await db.update(conversas).set({ unidadeId: unidade.id }).where(eq(conversas.id, ctx.conversaId));

  return { output: { unidade_resolvida: unidade.nome } };
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
      case "get_menu":
        return await getMenu(db, ctx);
      case "check_rodizio_price":
        return await checkRodizioPrice(db, ctx, input);
      case "escalate_to_human":
        return await escalateToHuman(db, ctx, input);
      case "resolver_unidade_da_conversa":
        return await resolverUnidadeDaConversa(db, ctx, input);
      default:
        return { output: { erro: `Tool desconhecida: ${nomeDaTool}` }, isError: true };
    }
  } catch (err) {
    return erroAmigavel(err);
  }
}
