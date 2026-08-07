import { Router } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { agenteConfig, mesas, salaoElementos, saloes, unidades } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { RecursoNaoEncontradoError } from "../../lib/errors.js";
import { criarReserva, criarReservaComMesaAutomatica } from "../../lib/reservations.js";
import { verificarDisponibilidade } from "../../lib/availability.js";
import { enviarPushParaUnidade } from "../../lib/push.js";
import { salvarOuAtualizarCliente } from "../../lib/clientes.js";
import { env } from "../../config/env.js";

// Rotas PUBLICAS do widget embutivel (doc 23) - reservas feitas pelo cliente direto no
// site do proprio restaurante, sem passar pelo Instagram. Diferente de
// reservation-link.routes.ts (token de curta duracao vinculado a uma conversa), aqui a
// unidade e identificada diretamente pelo unidadeId na URL - e um link ESTAVEL, feito
// pra ficar publicado num <script> no site do restaurante indefinidamente (nao expira).
export const widgetRouter = Router();

async function buscarUnidade(unidadeId: string) {
  const [unidade] = await db
    .select({ id: unidades.id, nome: unidades.nome, timezone: unidades.timezone, empresaId: unidades.empresaId })
    .from(unidades)
    .where(eq(unidades.id, unidadeId))
    .limit(1);
  return unidade;
}

widgetRouter.get(
  "/:unidadeId/info",
  asyncHandler(async (req, res) => {
    const unidade = await buscarUnidade(req.params.unidadeId);
    if (!unidade) throw new RecursoNaoEncontradoError("Unidade nao encontrada");

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

// Mesmo mapa visual usado por /public/reservation-link/:token/mesas-disponiveis, so que
// identificado direto pelo unidadeId em vez de um token de conversa.
widgetRouter.get(
  "/:unidadeId/mesas-disponiveis",
  asyncHandler(async (req, res) => {
    const unidade = await buscarUnidade(req.params.unidadeId);
    if (!unidade) throw new RecursoNaoEncontradoError("Unidade nao encontrada");

    const query = mesasDisponiveisQuerySchema.parse(req.query);

    const saloesMapa = await db
      .select({ id: saloes.id, nome: saloes.nome })
      .from(saloes)
      .where(and(eq(saloes.unidadeId, unidade.id), eq(saloes.modoConfiguracao, "mapa")));

    if (saloesMapa.length === 0) {
      res.json({ disponibilidade: { disponivel: false }, saloes: [] });
      return;
    }
    const salaoIds = saloesMapa.map((s) => s.id);

    const [disponibilidade, todasMesas, todosElementos] = await Promise.all([
      verificarDisponibilidade(db, { unidadeId: unidade.id, data: query.data, hora: query.horaInicio, numPessoas: query.numPessoas }),
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
      disponibilidade: { disponivel: disponibilidade.disponivel, motivo: disponibilidade.motivo },
      saloes: resultado,
    });
  }),
);

const criarReservaWidgetSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data deve estar no formato YYYY-MM-DD"),
  horaInicio: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "horario deve estar no formato HH:MM"),
  numPessoas: z.number().int().positive(),
  clienteNome: z.string().min(1),
  clienteTelefone: z.string().optional(),
  mesaId: z.string().uuid().optional(),
});

widgetRouter.post(
  "/:unidadeId/reservations",
  asyncHandler(async (req, res) => {
    const unidade = await buscarUnidade(req.params.unidadeId);
    if (!unidade) throw new RecursoNaoEncontradoError("Unidade nao encontrada");

    const dados = criarReservaWidgetSchema.parse(req.body);

    const reserva = dados.mesaId
      ? await criarReserva(db, {
          unidadeId: unidade.id,
          mesaId: dados.mesaId,
          data: dados.data,
          horaInicio: dados.horaInicio,
          numPessoas: dados.numPessoas,
          clienteNome: dados.clienteNome,
          clienteTelefone: dados.clienteTelefone,
          canalOrigem: "widget",
        })
      : await criarReservaComMesaAutomatica(db, {
          unidadeId: unidade.id,
          canalOrigem: "widget",
          data: dados.data,
          horaInicio: dados.horaInicio,
          numPessoas: dados.numPessoas,
          clienteNome: dados.clienteNome,
          clienteTelefone: dados.clienteTelefone,
        });

    if (dados.clienteTelefone) {
      salvarOuAtualizarCliente(db, {
        empresaId: unidade.empresaId,
        telefone: dados.clienteTelefone,
        nome: dados.clienteNome,
      }).catch((err) => {
        console.error("[widget] falha ao salvar dados do cliente:", err);
      });
    }

    enviarPushParaUnidade(db, unidade.id, {
      titulo: "Nova reserva (widget do site)",
      corpo: `${reserva.clienteNome} - ${reserva.data.split("-").reverse().join("/")} as ${reserva.horaInicio.slice(0, 5)}, ${reserva.numPessoas} pessoa(s)`,
      url: "/admin/reservas",
    }).catch((err) => {
      console.error("[widget] falha ao enviar push:", err);
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

// Snippet JS pronto pra colar no site do restaurante: <script src=".../public/widget/UNIDADE_ID/embed.js" defer></script>
// Injeta um botao flutuante que abre a pagina de reserva (a mesma usada pelo painel
// pra gerar o link, ver WidgetPage.tsx) dentro de um iframe sobreposto.
widgetRouter.get(
  "/:unidadeId/embed.js",
  asyncHandler(async (req, res) => {
    // O helmet() global marca toda resposta como Cross-Origin-Resource-Policy:
    // same-origin por padrao - isso bloquearia o proprio navegador de executar este
    // script quando carregado via <script src> a partir do site do restaurante (outra
    // origem, de proposito). Esta rota e a UNICA pensada pra ser embutida assim.
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

    const unidade = await buscarUnidade(req.params.unidadeId);
    if (!unidade) {
      res.status(404).type("application/javascript").send("console.error('Quero Reservar: unidade nao encontrada para o widget');");
      return;
    }

    const baseUrl = env.WEB_APP_URL ?? "";
    const script = `(function () {
  var UNIDADE_ID = ${JSON.stringify(unidade.id)};
  var BASE_URL = ${JSON.stringify(baseUrl)};
  var UNIDADE_NOME = ${JSON.stringify(unidade.nome)};

  var botao = document.createElement("button");
  botao.textContent = "Reservar mesa";
  botao.setAttribute("aria-label", "Reservar mesa em " + UNIDADE_NOME);
  botao.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:999999;padding:14px 22px;border:none;border-radius:999px;background:#d81b46;color:#f5efe8;font-family:system-ui,sans-serif;font-size:15px;font-weight:600;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.25);";

  var overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;z-index:999998;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;padding:16px;";

  var caixa = document.createElement("div");
  caixa.style.cssText = "position:relative;width:100%;max-width:420px;height:min(640px,90vh);background:#0d0d0d;border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5);";

  var fechar = document.createElement("button");
  fechar.textContent = "\\u00d7";
  fechar.setAttribute("aria-label", "Fechar");
  fechar.style.cssText = "position:absolute;top:8px;right:8px;z-index:1;width:32px;height:32px;border:none;border-radius:999px;background:rgba(0,0,0,.4);color:#fff;font-size:20px;line-height:1;cursor:pointer;";

  var iframe = document.createElement("iframe");
  iframe.src = BASE_URL + "/widget/" + UNIDADE_ID;
  iframe.title = "Reservar mesa em " + UNIDADE_NOME;
  iframe.style.cssText = "width:100%;height:100%;border:0;";

  caixa.appendChild(fechar);
  caixa.appendChild(iframe);
  overlay.appendChild(caixa);

  function abrir() { overlay.style.display = "flex"; }
  function fecharModal() { overlay.style.display = "none"; }

  botao.addEventListener("click", abrir);
  fechar.addEventListener("click", fecharModal);
  overlay.addEventListener("click", function (e) { if (e.target === overlay) fecharModal(); });

  document.body.appendChild(botao);
  document.body.appendChild(overlay);
})();
`;

    res.type("application/javascript").send(script);
  }),
);
