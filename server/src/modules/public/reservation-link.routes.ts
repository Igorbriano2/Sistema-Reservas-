import { Router } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Response } from "express";
import { db } from "../../db/client.js";
import { agenteConfig, conversas, mesas, salaoElementos, saloes, unidades } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { decodificarTokenDeReserva, TokenDeReservaInvalidoError } from "../../lib/reservation-link.js";
import { criarReserva, criarReservaComMesaAutomatica } from "../../lib/reservations.js";
import { verificarDisponibilidade } from "../../lib/availability.js";
import { enviarRespostaDoAgente } from "../../lib/instagram-notify.js";
import { enviarPushParaUnidade } from "../../lib/push.js";
import { salvarOuAtualizarCliente } from "../../lib/clientes.js";
import { criarDepositoDeReserva, obterStripe } from "../../lib/stripe.js";
import { DepositoJaUsadoError, RequisicaoInvalidaError } from "../../lib/errors.js";

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
      .select({ id: unidades.id, nome: unidades.nome, timezone: unidades.timezone, empresaId: unidades.empresaId })
      .from(unidades)
      .where(eq(unidades.id, payload.unidadeId))
      .limit(1);

    if (!unidade) return responderTokenInvalido(res);

    // Ids de tracking de marketing do PROPRIO restaurante (doc 13) - nulo se o dono
    // nunca configurou (agenteConfig pode nem existir ainda pra essa empresa).
    const [config] = await db
      .select({ googleTagId: agenteConfig.googleTagId, facebookPixelId: agenteConfig.facebookPixelId })
      .from(agenteConfig)
      .where(eq(agenteConfig.empresaId, unidade.empresaId))
      .limit(1);

    res.json({
      unidadeNome: unidade.nome,
      timezone: unidade.timezone,
      googleTagId: config?.googleTagId ?? null,
      facebookPixelId: config?.facebookPixelId ?? null,
    });
  }),
);

const mesasDisponiveisQuerySchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data deve estar no formato YYYY-MM-DD"),
  horaInicio: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "horario deve estar no formato HH:MM"),
  numPessoas: z.coerce.number().int().positive(),
});

// Devolve o mapa visual (mesas + elementos decorativos) de cada salao em modo "mapa"
// da unidade, com cada mesa marcada disponivel/indisponivel (e o motivo) pro
// horario/numero de pessoas informado - usado pela Parte 2 do editor visual (cliente
// escolhe a mesa na pagina publica). Reaproveita verificarDisponibilidade (mesma logica
// ja usada pelo admin e pelo agente de IA) em vez de duplicar a checagem de conflito.
reservationLinkRouter.get(
  "/:token/mesas-disponiveis",
  asyncHandler(async (req, res) => {
    let payload;
    try {
      payload = decodificarTokenDeReserva(req.params.token);
    } catch (err) {
      if (err instanceof TokenDeReservaInvalidoError) return responderTokenInvalido(res);
      throw err;
    }

    const query = mesasDisponiveisQuerySchema.parse(req.query);

    const saloesMapa = await db
      .select({ id: saloes.id, nome: saloes.nome })
      .from(saloes)
      .where(and(eq(saloes.unidadeId, payload.unidadeId), eq(saloes.modoConfiguracao, "mapa")));

    if (saloesMapa.length === 0) {
      res.json({ saloes: [] });
      return;
    }
    const salaoIds = saloesMapa.map((s) => s.id);

    const [disponibilidade, todasMesas, todosElementos] = await Promise.all([
      verificarDisponibilidade(db, {
        unidadeId: payload.unidadeId,
        data: query.data,
        hora: query.horaInicio,
        numPessoas: query.numPessoas,
      }),
      db
        .select({
          id: mesas.id,
          salaoId: mesas.salaoId,
          nome: mesas.nome,
          capacidadeMin: mesas.capacidadeMin,
          capacidadeMax: mesas.capacidadeMax,
          formato: mesas.formato,
          posX: mesas.posX,
          posY: mesas.posY,
          largura: mesas.largura,
          altura: mesas.altura,
        })
        .from(mesas)
        .where(inArray(mesas.salaoId, salaoIds)),
      db
        .select({
          id: salaoElementos.id,
          salaoId: salaoElementos.salaoId,
          tipo: salaoElementos.tipo,
          nome: salaoElementos.nome,
          posX: salaoElementos.posX,
          posY: salaoElementos.posY,
          largura: salaoElementos.largura,
          altura: salaoElementos.altura,
          rotacao: salaoElementos.rotacao,
          capacidade: salaoElementos.capacidade,
        })
        .from(salaoElementos)
        .where(inArray(salaoElementos.salaoId, salaoIds)),
    ]);

    const idsDisponiveis = new Set(disponibilidade.mesasDisponiveis.map((m) => m.id));

    // O motivo por mesa vem sempre de capacidade/ocupacao da PROPRIA mesa - nao do
    // motivo agregado de verificarDisponibilidade (esse so descreve o caso "nenhuma
    // opcao serve", nao necessariamente porque ESSA mesa especifica esta ocupada).
    // Fechamento do dia/fora do horario de funcionamento fica no campo "disponibilidade"
    // no nivel do salao inteiro, exibido a parte pelo frontend.
    const resultado = saloesMapa.map((salao) => ({
      id: salao.id,
      nome: salao.nome,
      mesas: todasMesas
        .filter((m) => m.salaoId === salao.id)
        .map((m) => {
          const disponivel = idsDisponiveis.has(m.id);
          let motivo: string | undefined;
          if (!disponivel) {
            motivo =
              query.numPessoas < m.capacidadeMin || query.numPessoas > m.capacidadeMax
                ? "Nao comporta esse numero de pessoas"
                : "Ocupada nesse horario";
          }
          return { ...m, disponivel, motivo };
        }),
      elementos: todosElementos.filter((e) => e.salaoId === salao.id),
    }));

    res.json({
      // turno (doc 22) - deixa o frontend saber ANTES de chegar na etapa de
      // confirmacao se esse horario vai exigir deposito, pra mostrar a etapa de
      // pagamento no lugar certo do fluxo em vez de descobrir so no POST final.
      disponibilidade: { disponivel: disponibilidade.disponivel, motivo: disponibilidade.motivo, turno: disponibilidade.turno },
      saloes: resultado,
    });
  }),
);

const criarDepositoQuerySchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data deve estar no formato YYYY-MM-DD"),
  horaInicio: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "horario deve estar no formato HH:MM"),
  numPessoas: z.number().int().positive(),
});

// Doc 22 - so chamada quando o turno do horario escolhido exige deposito (o frontend
// confere isso no resultado de mesas-disponiveis antes de mostrar a etapa de
// pagamento). Cria o PaymentIntent na Stripe SEM criar a reserva ainda - a reserva so
// nasce depois do pagamento confirmado, em POST /reservations (evita segurar um
// horario refem de um pagamento abandonado).
reservationLinkRouter.post(
  "/:token/deposito",
  asyncHandler(async (req, res) => {
    let payload;
    try {
      payload = decodificarTokenDeReserva(req.params.token);
    } catch (err) {
      if (err instanceof TokenDeReservaInvalidoError) return responderTokenInvalido(res);
      throw err;
    }

    const dados = criarDepositoQuerySchema.parse(req.body);

    const disponibilidade = await verificarDisponibilidade(db, {
      unidadeId: payload.unidadeId,
      data: dados.data,
      hora: dados.horaInicio,
      numPessoas: dados.numPessoas,
    });
    if (!disponibilidade.disponivel) {
      throw new RequisicaoInvalidaError(disponibilidade.motivo ?? "Nao ha disponibilidade para esse horario");
    }
    if (!disponibilidade.turno?.exigeDeposito || !disponibilidade.turno.valorDepositoCentavos) {
      throw new RequisicaoInvalidaError("Este horario nao exige deposito");
    }

    const stripe = obterStripe();
    const deposito = await criarDepositoDeReserva(stripe, {
      valorCentavos: disponibilidade.turno.valorDepositoCentavos,
      metadata: {
        unidadeId: payload.unidadeId,
        igSenderId: payload.igSenderId,
        data: dados.data,
        horaInicio: dados.horaInicio,
      },
    });

    res.json({
      clientSecret: deposito.clientSecret,
      paymentIntentId: deposito.paymentIntentId,
      valorCentavos: disponibilidade.turno.valorDepositoCentavos,
    });
  }),
);

const criarReservaPublicaSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data deve estar no formato YYYY-MM-DD"),
  horaInicio: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "horario deve estar no formato HH:MM"),
  numPessoas: z.number().int().positive(),
  clienteNome: z.string().min(1),
  clienteTelefone: z.string().optional(),
  // Escolhida pelo cliente no mapa visual (Parte 2). Se ausente, cai no fluxo antigo
  // (backend escolhe a mesa/salao automaticamente).
  mesaId: z.string().uuid().optional(),
  // Doc 16 - opcionais, so tem efeito quando clienteTelefone tambem e informado (sem
  // telefone nao ha pra quem mandar WhatsApp nenhum). Opt-in nunca e assumido: so vira
  // true se o campo vier explicitamente true (checkbox comeca desmarcado no form).
  dataNascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data de nascimento deve estar no formato YYYY-MM-DD").optional(),
  whatsappOptIn: z.boolean().optional(),
  // Doc 22 - obrigatorio quando o turno exige deposito (obtido em POST /deposito e
  // confirmado no navegador via stripe.confirmCardPayment antes de chegar aqui).
  paymentIntentId: z.string().optional(),
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

    // Doc 22 - so usado pra descobrir o turno (e se ele exige deposito) - a
    // disponibilidade de fato (mesa/salao livre, sem conflito) e responsabilidade de
    // criarReserva/criarReservaComMesaAutomatica logo abaixo, que tranca a linha e
    // reflete o estado mais atual possivel (aqui poderia estar desatualizado por uma
    // corrida entre esta consulta e a criacao em si).
    const disponibilidade = await verificarDisponibilidade(db, {
      unidadeId: payload.unidadeId,
      data: dados.data,
      hora: dados.horaInicio,
      numPessoas: dados.numPessoas,
    });

    // Se o cliente mandou um paymentIntentId, valida ele SEMPRE (independente do que a
    // re-checagem acima disser sobre exigir deposito agora) - a capacidade pode ter
    // sumido entre o pagamento e esta chamada, o que apaga o "turno" da resposta de
    // verificarDisponibilidade (ver semDisponibilidade em availability.ts); o proprio
    // pagamento, com metadata batendo EXATAMENTE com esta unidade/cliente/data/horario,
    // ja e prova suficiente de que era um deposito legitimo pra este pedido (so o
    // endpoint /deposito cria PaymentIntent com essa metadata, e so quando o turno
    // exigia deposito no momento em que foi gerado). So quando NAO ha paymentIntentId
    // e a checagem atual ainda enxerga o turno exigindo deposito, rejeita.
    let statusPagamento: "pago" | undefined;
    let stripePaymentIntentId: string | undefined;
    if (dados.paymentIntentId) {
      const stripe = obterStripe();
      const paymentIntent = await stripe.paymentIntents.retrieve(dados.paymentIntentId);
      if (paymentIntent.status !== "succeeded") {
        throw new RequisicaoInvalidaError("O pagamento do deposito ainda nao foi confirmado");
      }
      if (
        paymentIntent.metadata.unidadeId !== payload.unidadeId ||
        paymentIntent.metadata.igSenderId !== payload.igSenderId ||
        paymentIntent.metadata.data !== dados.data ||
        paymentIntent.metadata.horaInicio !== dados.horaInicio
      ) {
        throw new RequisicaoInvalidaError("Este deposito nao corresponde a esta reserva");
      }
      statusPagamento = "pago";
      stripePaymentIntentId = dados.paymentIntentId;
    } else if (disponibilidade.turno?.exigeDeposito) {
      throw new RequisicaoInvalidaError("Este horario exige um deposito - pague antes de confirmar a reserva");
    }

    let reserva;
    try {
      reserva = dados.mesaId
        ? await criarReserva(db, {
            unidadeId: payload.unidadeId,
            igSenderId: payload.igSenderId,
            mesaId: dados.mesaId,
            data: dados.data,
            horaInicio: dados.horaInicio,
            numPessoas: dados.numPessoas,
            clienteNome: dados.clienteNome,
            clienteTelefone: dados.clienteTelefone,
            canalOrigem: "instagram",
            statusPagamento,
            stripePaymentIntentId,
          })
        : await criarReservaComMesaAutomatica(db, {
            unidadeId: payload.unidadeId,
            igSenderId: payload.igSenderId,
            canalOrigem: "instagram",
            data: dados.data,
            horaInicio: dados.horaInicio,
            numPessoas: dados.numPessoas,
            clienteNome: dados.clienteNome,
            clienteTelefone: dados.clienteTelefone,
            statusPagamento,
            stripePaymentIntentId,
          });
    } catch (err) {
      // O deposito ja foi cobrado mas a reserva nao pode ser criada (ex: outra pessoa
      // pegou a ultima mesa entre o pagamento e a confirmacao) - reembolsa na hora pra
      // nunca cobrar um cliente por uma reserva que nao existe. EXCECAO: DepositoJaUsadoError
      // (doc 25) significa que este PaymentIntent ja financiou OUTRA reserva legitima -
      // reembolsar aqui devolveria o dinheiro de uma reserva valida que continua de pe.
      if (stripePaymentIntentId && !(err instanceof DepositoJaUsadoError)) {
        obterStripe()
          .refunds.create({ payment_intent: stripePaymentIntentId })
          .catch((refundErr) => {
            console.error("[reserva-publica] FALHA AO REEMBOLSAR deposito apos erro na criacao da reserva:", refundErr);
          });
      }
      throw err;
    }

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

    // Doc 16 - so persiste dados do cliente (opt-in/data de nascimento) quando ha
    // telefone pra vincular; nao bloqueia a resposta se a gravacao falhar.
    if (dados.clienteTelefone) {
      const [unidadeDaReserva] = await db
        .select({ empresaId: unidades.empresaId })
        .from(unidades)
        .where(eq(unidades.id, payload.unidadeId))
        .limit(1);
      if (unidadeDaReserva) {
        salvarOuAtualizarCliente(db, {
          empresaId: unidadeDaReserva.empresaId,
          telefone: dados.clienteTelefone,
          nome: dados.clienteNome,
          dataNascimento: dados.dataNascimento,
          whatsappOptIn: dados.whatsappOptIn,
        }).catch((err) => {
          console.error("[reserva-publica] falha ao salvar dados do cliente:", err);
        });
      }
    }

    // Avisa os dispositivos da unidade com o PWA instalado (doc 15) - nao bloqueia a
    // resposta ao cliente se o envio falhar.
    enviarPushParaUnidade(db, payload.unidadeId, {
      titulo: "Nova reserva",
      corpo: `${reserva.clienteNome} - ${reserva.data.split("-").reverse().join("/")} as ${reserva.horaInicio.slice(0, 5)}, ${reserva.numPessoas} pessoa(s)`,
      url: "/admin/reservas",
    }).catch((err) => {
      console.error("[reserva-publica] falha ao enviar push:", err);
    });

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
