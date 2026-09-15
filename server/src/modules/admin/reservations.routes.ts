import { Router } from "express";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { empresas, reservaStatusEnum, reservas } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { validarJanelaDeFuncionamento } from "../../lib/availability.js";
import { salvarOuAtualizarCliente } from "../../lib/clientes.js";
import { ConflitoDeHorarioError, RequisicaoInvalidaError } from "../../lib/errors.js";
import { atualizarReservaDaUnidade, cancelarReservaDaUnidade, criarReserva } from "../../lib/reservations.js";

export const reservationsRouter = Router({ mergeParams: true });

const horaSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use o formato HH:MM");
const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato YYYY-MM-DD");

// Doc 46 - so retorna a linha quando a empresa (do login autenticado) tem a
// funcionalidade de comanda marcada pelo admin da plataforma (ClientesPage) - usado
// tanto pra decidir se persiste o numero da comanda quanto, no futuro, outras telas
// gated pela mesma flag.
async function empresaTemComandaHabilitada(empresaId: string): Promise<boolean> {
  const [empresa] = await db.select({ comandaHabilitada: empresas.comandaHabilitada }).from(empresas).where(eq(empresas.id, empresaId)).limit(1);
  return empresa?.comandaHabilitada ?? false;
}

// "data" filtra um dia exato (usado pelo painel operacional); "dataInicio"/"dataFim"
// filtram um periodo (usado pelo dashboard gerencial) - mutuamente exclusivos.
const listarQuerySchema = z.object({
  data: dataSchema.optional(),
  dataInicio: dataSchema.optional(),
  dataFim: dataSchema.optional(),
});

// Doc 46 - nome/telefone/data de nascimento passam a ser obrigatorios ao CRIAR uma
// reserva manual pelo painel, igual ao link publico e ao widget (ver reservation-link.
// routes.ts/widget.routes.ts) - antes so nome era exigido. So vale pra criacao: editar
// uma reserva ja existente (atualizarReservaSchema abaixo) nao reabre essa exigencia
// pra registros antigos sem telefone/nascimento.
const dataNascimentoSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data de nascimento deve estar no formato YYYY-MM-DD");

const criarReservaSchema = z
  .object({
    mesaId: z.string().uuid().optional(),
    salaoId: z.string().uuid().optional(),
    data: dataSchema,
    horaInicio: horaSchema,
    horaFim: horaSchema.optional(),
    numPessoas: z.number().int().positive(),
    clienteNome: z.string().min(1),
    clienteTelefone: z.string().min(1),
    dataNascimento: dataNascimentoSchema,
    observacoes: z.string().optional(),
    // Doc 46 - so tem efeito quando a empresa tem comanda_habilitada=true (ver
    // empresaTemComandaHabilitada acima); ignorado silenciosamente pra qualquer outra
    // empresa, mesmo que o campo venha preenchido no body.
    comanda: z.string().optional(),
  })
  .refine((d) => !!d.mesaId !== !!d.salaoId, "Informe exatamente um dos dois: mesaId ou salaoId");

const atualizarReservaSchema = z
  .object({
    mesaId: z.string().uuid().optional(),
    salaoId: z.string().uuid().optional(),
    data: dataSchema.optional(),
    horaInicio: horaSchema.optional(),
    horaFim: horaSchema.optional(),
    numPessoas: z.number().int().positive().optional(),
    clienteNome: z.string().min(1).optional(),
    clienteTelefone: z.string().optional(),
    observacoes: z.string().optional(),
    comanda: z.string().optional(),
    status: z.enum(reservaStatusEnum.enumValues).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "Informe ao menos um campo para atualizar")
  .refine((d) => !(d.mesaId && d.salaoId), "Informe no maximo um dos dois: mesaId ou salaoId");

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

    // Doc 41/44/45 - gerente/owner pode cadastrar manualmente mesmo com o salao
    // fechado (sem horario de funcionamento cadastrado pro dia, dia marcado como
    // excecao fechada, ou horario pedido fora de qualquer turno), antecedencia minima
    // nao cumprida, bloqueado, ou com a capacidade ja esgotada "naturalmente" pelas
    // reservas ativas - o cargo precisa conseguir mexer na reserva independente de
    // qual regra travaria. Funcionario continua sujeito a todas essas checagens,
    // igual reserva feita pelo agente/cliente.
    const podeIgnorarBloqueioECapacidade = req.auth!.papel === "owner" || req.auth!.papel === "gerente";

    // Doc 37 - a mesma antecedencia minima que ja vale pra edicao (e pro cliente via
    // agente/link publico) tambem vale pra reserva manual criada pelo painel: sem essa
    // checagem, dava pra criar direto pra qualquer horario (inclusive fechado) e so a
    // EDICAO respeitava a regra - inconsistente. Horarios fixos (doc 28) continuam so
    // pro fluxo publico (respeitarHorariosFixos: false) - o dono/funcionario sempre
    // pode escolher qualquer horario dentro do turno.
    const validacaoDaJanela = await validarJanelaDeFuncionamento(db, {
      unidadeId: req.unidadeId!,
      data: dados.data,
      horaInicio: dados.horaInicio,
      respeitarHorariosFixos: false,
      ignorarRegrasDeHorario: podeIgnorarBloqueioECapacidade,
    });
    if (!validacaoDaJanela.ok) {
      throw new ConflitoDeHorarioError(validacaoDaJanela.motivo);
    }

    // Doc 46 - comanda so e persistida pra empresas com a funcionalidade marcada
    // (Cervegela por enquanto); qualquer outra empresa que mande o campo tem ele
    // silenciosamente ignorado, sem erro (evita 400 surpresa se o frontend cachear
    // um form antigo/outra aba).
    const comandaHabilitada = await empresaTemComandaHabilitada(req.auth!.empresaId);
    const { dataNascimento, comanda, ...dadosDaReserva } = dados;

    const reserva = await criarReserva(db, {
      unidadeId: req.unidadeId!,
      canalOrigem: "manual",
      ignorarBloqueioECapacidade: podeIgnorarBloqueioECapacidade,
      comanda: comandaHabilitada ? comanda : undefined,
      ...dadosDaReserva,
    });

    // Doc 46 - mesmo upsert que o link publico/widget ja fazem: nome/telefone/
    // nascimento agora sao obrigatorios em toda reserva nova, entao toda reserva
    // manual tambem alimenta a tabela de clientes (aniversario/WhatsApp, doc 16), nao
    // so as feitas pelo proprio cliente. AGUARDADO (nao fire-and-forget como no link
    // publico/widget): aqui quem esta esperando a resposta e o proprio atendente no
    // painel, nao um cliente numa pagina publica onde cada milissegundo de latencia
    // importa - e sem aguardar, o insert podia sobreviver a resposta HTTP e ainda
    // estar em voo quando o processo seguinte mexesse nas mesmas tabelas (o caso real
    // que pegamos: corrida com o TRUNCATE ... CASCADE entre testes).
    try {
      await salvarOuAtualizarCliente(db, {
        empresaId: req.auth!.empresaId,
        telefone: dados.clienteTelefone,
        nome: dados.clienteNome,
        dataNascimento: dados.dataNascimento,
      });
    } catch (err) {
      console.error("[admin/reservations] falha ao salvar dados do cliente:", err);
    }

    res.status(201).json(reserva);
  }),
);

reservationsRouter.patch(
  "/:reservationId",
  asyncHandler(async (req, res) => {
    const dados = atualizarReservaSchema.parse(req.body);
    // Doc 44 - mesmo bypass ja existente na criacao (doc 41): gerente/owner tambem
    // pode EDITAR uma reserva (trocar data/horario/numero de pessoas) mesmo com o
    // salao fechado, bloqueado, ou com a capacidade esgotada; funcionario continua
    // sujeito a todas as checagens.
    const podeIgnorarBloqueioECapacidade = req.auth!.papel === "owner" || req.auth!.papel === "gerente";
    // Doc 46 - mesmo racional do POST: ignora silenciosamente pra empresa sem a
    // funcionalidade. So consulta o flag quando o body realmente tenta mexer na
    // comanda (evita uma query extra em toda edicao comum, ex: marcar sentada).
    if (dados.comanda !== undefined && !(await empresaTemComandaHabilitada(req.auth!.empresaId))) {
      delete dados.comanda;
    }
    const reserva = await atualizarReservaDaUnidade(db, req.unidadeId!, req.params.reservationId, dados, {
      ignorarBloqueioECapacidade: podeIgnorarBloqueioECapacidade,
    });
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
