import cron, { type ScheduledTask } from "node-cron";
import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  clientes,
  mensagensMarketingLog,
  reservas,
  unidades,
  whatsappConfig,
  whatsappConnections,
  type TipoCampanhaMarketing,
} from "../db/schema/index.js";
import { env } from "../config/env.js";
import { decrypt } from "./crypto.js";
import { enviarTemplateWhatsapp } from "./whatsapp-api.js";

// "Ontem" em UTC - mesma logica simples usada no resto do app pra data local do
// servidor (ver dataLocal() das paginas de dashboard/reservas no frontend).
function dataLocalOffset(offsetDias: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDias);
  return d.toISOString().slice(0, 10);
}

// Cada empresa pode ter uma conexao por unidade OU uma unica pra empresa toda
// (unidade_id nulo) - prioriza a especifica da unidade quando existe, mesmo padrao
// de resolucao usado pro Instagram.
// Exportado tambem pra uso fora do agendador diario (ex: aviso imediato da fila de
// espera, doc 20) - mesma resolucao de conexao WhatsApp ativa da empresa/unidade.
export async function conexaoAtivaDaEmpresa(db: Database, empresaId: string, unidadeId: string | null) {
  const conexoes = await db
    .select()
    .from(whatsappConnections)
    .where(and(eq(whatsappConnections.empresaId, empresaId), eq(whatsappConnections.status, "ativo")));
  if (conexoes.length === 0) return null;
  const especifica = unidadeId ? conexoes.find((c) => c.unidadeId === unidadeId) : undefined;
  return especifica ?? conexoes.find((c) => c.unidadeId === null) ?? conexoes[0];
}

export interface ResultadoRotina {
  enviados: number;
  falhas: number;
}

async function enviarParaCliente(
  db: Database,
  params: {
    empresaId: string;
    unidadeId: string | null;
    telefone: string;
    tipo: TipoCampanhaMarketing;
    nomeDoTemplate: string;
    reservaId?: string;
  },
): Promise<boolean> {
  const conexao = await conexaoAtivaDaEmpresa(db, params.empresaId, params.unidadeId);
  if (!conexao || !env.TOKEN_ENCRYPTION_KEY) {
    await db.insert(mensagensMarketingLog).values({
      empresaId: params.empresaId,
      reservaId: params.reservaId,
      clienteTelefone: params.telefone,
      tipo: params.tipo,
      templateUsado: params.nomeDoTemplate,
      status: "falhou",
    });
    return false;
  }

  try {
    const accessToken = decrypt(conexao.accessTokenEncrypted, env.TOKEN_ENCRYPTION_KEY);
    await enviarTemplateWhatsapp({
      accessToken,
      phoneNumberId: conexao.phoneNumberId,
      telefoneDestino: params.telefone,
      nomeDoTemplate: params.nomeDoTemplate,
      idioma: env.WHATSAPP_TEMPLATE_LANG,
    });
    await db.insert(mensagensMarketingLog).values({
      empresaId: params.empresaId,
      reservaId: params.reservaId,
      clienteTelefone: params.telefone,
      tipo: params.tipo,
      templateUsado: params.nomeDoTemplate,
      status: "enviado",
    });
    return true;
  } catch (err) {
    console.error(`[whatsapp-scheduler] falha ao enviar ${params.tipo} para ${params.telefone}:`, err);
    await db.insert(mensagensMarketingLog).values({
      empresaId: params.empresaId,
      reservaId: params.reservaId,
      clienteTelefone: params.telefone,
      tipo: params.tipo,
      templateUsado: params.nomeDoTemplate,
      status: "falhou",
    });
    return false;
  }
}

// Reservas concluidas (cliente sentou) ontem, cujo cliente deu opt-in - uma unica
// tentativa por reserva (a trava e o reserva_id no log, nao o telefone: o mesmo
// cliente pode e deve receber feedback de reservas diferentes).
export async function executarRotinaFeedback(db: Database): Promise<ResultadoRotina> {
  const ontem = dataLocalOffset(-1);
  const candidatos = await db
    .select({
      reservaId: reservas.id,
      unidadeId: reservas.unidadeId,
      empresaId: unidades.empresaId,
      telefone: reservas.clienteTelefone,
      feedbackAtivo: whatsappConfig.feedbackAtivo,
    })
    .from(reservas)
    .innerJoin(unidades, eq(unidades.id, reservas.unidadeId))
    .leftJoin(whatsappConfig, eq(whatsappConfig.empresaId, unidades.empresaId))
    .where(and(eq(reservas.status, "concluida"), eq(reservas.data, ontem), isNotNull(reservas.clienteTelefone)));

  let enviados = 0;
  let falhas = 0;
  for (const c of candidatos) {
    if (c.feedbackAtivo === false || !c.telefone) continue;

    const [cliente] = await db
      .select()
      .from(clientes)
      .where(and(eq(clientes.empresaId, c.empresaId), eq(clientes.telefone, c.telefone)))
      .limit(1);
    if (!cliente?.whatsappOptIn) continue;

    const [jaEnviado] = await db
      .select()
      .from(mensagensMarketingLog)
      .where(and(eq(mensagensMarketingLog.reservaId, c.reservaId), eq(mensagensMarketingLog.tipo, "feedback")))
      .limit(1);
    if (jaEnviado) continue;

    const ok = await enviarParaCliente(db, {
      empresaId: c.empresaId,
      unidadeId: c.unidadeId,
      telefone: c.telefone,
      tipo: "feedback",
      nomeDoTemplate: env.WHATSAPP_TEMPLATE_FEEDBACK,
      reservaId: c.reservaId,
    });
    if (ok) enviados++;
    else falhas++;
  }
  return { enviados, falhas };
}

// Clientes com opt-in cujo dia/mes de nascimento e hoje, ainda nao notificados este
// ano (checagem por enviado_em >= 1o de janeiro do ano corrente).
export async function executarRotinaAniversario(db: Database): Promise<ResultadoRotina> {
  const hoje = new Date();
  const mesHoje = hoje.getUTCMonth() + 1;
  const diaHoje = hoje.getUTCDate();
  const inicioDoAno = new Date(Date.UTC(hoje.getUTCFullYear(), 0, 1));

  const candidatos = await db
    .select({
      empresaId: clientes.empresaId,
      telefone: clientes.telefone,
      dataNascimento: clientes.dataNascimento,
      aniversarioAtivo: whatsappConfig.aniversarioAtivo,
    })
    .from(clientes)
    .leftJoin(whatsappConfig, eq(whatsappConfig.empresaId, clientes.empresaId))
    .where(and(eq(clientes.whatsappOptIn, true), isNotNull(clientes.dataNascimento)));

  let enviados = 0;
  let falhas = 0;
  for (const c of candidatos) {
    if (c.aniversarioAtivo === false || !c.dataNascimento) continue;
    const [, mesStr, diaStr] = c.dataNascimento.split("-");
    if (Number(mesStr) !== mesHoje || Number(diaStr) !== diaHoje) continue;

    const [jaEnviado] = await db
      .select()
      .from(mensagensMarketingLog)
      .where(
        and(
          eq(mensagensMarketingLog.clienteTelefone, c.telefone),
          eq(mensagensMarketingLog.tipo, "aniversario"),
          gte(mensagensMarketingLog.enviadoEm, inicioDoAno),
        ),
      )
      .limit(1);
    if (jaEnviado) continue;

    // Aniversario nao parte de uma reserva/unidade especifica - usa a conexao da
    // empresa toda (unidade_id nulo) quando existir.
    const ok = await enviarParaCliente(db, {
      empresaId: c.empresaId,
      unidadeId: null,
      telefone: c.telefone,
      tipo: "aniversario",
      nomeDoTemplate: env.WHATSAPP_TEMPLATE_ANIVERSARIO,
    });
    if (ok) enviados++;
    else falhas++;
  }
  return { enviados, falhas };
}

// Cooldown minimo entre duas tentativas de recuperacao pro MESMO cliente, mesmo que
// ele continue inativo entre uma rodada e outra - evita mandar toda vez que o
// agendador roda (diariamente) enquanto o cliente nao volta.
const DIAS_COOLDOWN_RECUPERACAO = 30;

// Clientes com opt-in cuja ULTIMA reserva concluida foi ha mais de N dias
// (configuravel por empresa, default 60) - so se aplica a quem ja teve ao menos uma
// reserva concluida (sem isso nao ha "voltar", e so um cliente novo).
export async function executarRotinaRecuperacao(db: Database): Promise<ResultadoRotina> {
  const candidatos = await db
    .select({
      empresaId: clientes.empresaId,
      telefone: clientes.telefone,
      recuperacaoAtivo: whatsappConfig.recuperacaoAtivo,
      diasInatividade: whatsappConfig.diasInatividadeRecuperacao,
    })
    .from(clientes)
    .leftJoin(whatsappConfig, eq(whatsappConfig.empresaId, clientes.empresaId))
    .where(eq(clientes.whatsappOptIn, true));

  let enviados = 0;
  let falhas = 0;
  for (const c of candidatos) {
    if (c.recuperacaoAtivo === false) continue;
    const diasInatividade = c.diasInatividade ?? 60;

    const [ultimaReserva] = await db
      .select({ data: reservas.data })
      .from(reservas)
      .innerJoin(unidades, eq(unidades.id, reservas.unidadeId))
      .where(and(eq(unidades.empresaId, c.empresaId), eq(reservas.clienteTelefone, c.telefone), eq(reservas.status, "concluida")))
      .orderBy(desc(reservas.data))
      .limit(1);
    if (!ultimaReserva) continue;

    const limiteInatividade = dataLocalOffset(-diasInatividade);
    if (ultimaReserva.data > limiteInatividade) continue;

    const cortesCooldown = new Date();
    cortesCooldown.setUTCDate(cortesCooldown.getUTCDate() - DIAS_COOLDOWN_RECUPERACAO);
    const [jaEnviadoRecente] = await db
      .select()
      .from(mensagensMarketingLog)
      .where(
        and(
          eq(mensagensMarketingLog.clienteTelefone, c.telefone),
          eq(mensagensMarketingLog.tipo, "recuperacao"),
          gte(mensagensMarketingLog.enviadoEm, cortesCooldown),
        ),
      )
      .limit(1);
    if (jaEnviadoRecente) continue;

    const ok = await enviarParaCliente(db, {
      empresaId: c.empresaId,
      unidadeId: null,
      telefone: c.telefone,
      tipo: "recuperacao",
      nomeDoTemplate: env.WHATSAPP_TEMPLATE_RECUPERACAO,
    });
    if (ok) enviados++;
    else falhas++;
  }
  return { enviados, falhas };
}

export async function executarRotinasDiariasDeMarketing(db: Database): Promise<void> {
  const feedback = await executarRotinaFeedback(db);
  const aniversario = await executarRotinaAniversario(db);
  const recuperacao = await executarRotinaRecuperacao(db);
  console.log(
    `[whatsapp-scheduler] feedback: ${feedback.enviados} enviados/${feedback.falhas} falhas | ` +
      `aniversario: ${aniversario.enviados} enviados/${aniversario.falhas} falhas | ` +
      `recuperacao: ${recuperacao.enviados} enviados/${recuperacao.falhas} falhas`,
  );
}

let tarefaAgendada: ScheduledTask | null = null;

// Chamado uma vez na inicializacao do servidor (ver server.ts). Mesma premissa de
// instancia unica ja documentada pro agrupamento de mensagens do agente do Instagram -
// rodar em mais de um processo ao mesmo tempo duplicaria os envios.
export function iniciarAgendadorWhatsapp(db: Database): void {
  if (tarefaAgendada) return;
  tarefaAgendada = cron.schedule(env.WHATSAPP_SCHEDULER_CRON, () => {
    executarRotinasDiariasDeMarketing(db).catch((err) => {
      console.error("[whatsapp-scheduler] falha nas rotinas diarias:", err);
    });
  });
}

export function pararAgendadorWhatsapp(): void {
  tarefaAgendada?.stop();
  tarefaAgendada = null;
}
