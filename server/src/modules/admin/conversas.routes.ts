import { Router } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { conversas, mensagens } from "../../db/schema/index.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { RecursoNaoEncontradoError, RequisicaoInvalidaError } from "../../lib/errors.js";
import { enviarRespostaDoAgente } from "../../lib/instagram-notify.js";
import { preencherPerfisFaltantes } from "../../lib/instagram-profile.js";

export const conversasRouter = Router({ mergeParams: true });

// Doc 34 - a lista vira um "chat estilo WhatsApp Web": cada conversa mostra a ultima
// mensagem (preview) e a lista fica ordenada pela mais recente primeiro, igual
// qualquer app de chat. Busca so as 500 mensagens mais recentes entre TODAS as
// conversas da unidade (nao por conversa) - suficiente pra cobrir a ultima de cada
// uma no volume normal de um restaurante, sem paginar nada aqui.
async function anexarUltimaMensagem(lista: (typeof conversas.$inferSelect)[]) {
  const ids = lista.map((c) => c.id);
  const recentes =
    ids.length === 0
      ? []
      : await db
          .select({ conversaId: mensagens.conversaId, conteudo: mensagens.conteudo, criadoEm: mensagens.criadoEm })
          .from(mensagens)
          .where(inArray(mensagens.conversaId, ids))
          .orderBy(desc(mensagens.criadoEm))
          .limit(500);

  const ultimaPorConversa = new Map<string, { conteudo: string; criadoEm: Date }>();
  for (const m of recentes) {
    if (!ultimaPorConversa.has(m.conversaId)) ultimaPorConversa.set(m.conversaId, m);
  }

  return lista
    .map((c) => {
      const ultima = ultimaPorConversa.get(c.id);
      return { ...c, ultimaMensagem: ultima?.conteudo ?? null, ultimaMensagemEm: ultima?.criadoEm ?? null };
    })
    .sort((a, b) => {
      const dataA = a.ultimaMensagemEm ?? a.ultimaAtividadeHumanaEm;
      const dataB = b.ultimaMensagemEm ?? b.ultimaAtividadeHumanaEm;
      if (!dataA && !dataB) return 0;
      if (!dataA) return 1;
      if (!dataB) return -1;
      return new Date(dataB).getTime() - new Date(dataA).getTime();
    });
}

conversasRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const lista = await db.select().from(conversas).where(eq(conversas.unidadeId, req.unidadeId!));
    res.json(await anexarUltimaMensagem(lista));
    // Doc 33 - backfill de nome/foto pra conversas antigas (criadas antes desse campo
    // existir): roda depois da resposta, nao atrasa a listagem.
    void preencherPerfisFaltantes(db, lista);
  }),
);

conversasRouter.get(
  "/:conversaId/mensagens",
  asyncHandler(async (req, res) => {
    const [conversa] = await db
      .select({ id: conversas.id })
      .from(conversas)
      .where(and(eq(conversas.id, req.params.conversaId), eq(conversas.unidadeId, req.unidadeId!)))
      .limit(1);
    if (!conversa) throw new RecursoNaoEncontradoError("Conversa nao encontrada");

    const lista = await db
      .select()
      .from(mensagens)
      .where(eq(mensagens.conversaId, conversa.id))
      .orderBy(asc(mensagens.criadoEm));
    res.json(lista);
  }),
);

const enviarMensagemSchema = z.object({ texto: z.string().trim().min(1).max(2000) });

// Doc 31 - o dono/funcionario responde pelo proprio painel em vez de precisar abrir a
// Meta Business Suite. Envia de verdade pelo Instagram (mesmo caminho de saida usado
// pelo agente), registra no historico com enviadoPorHumano=true, e pausa o agente
// automaticamente (se ja nao estiver pausado) - a mesma logica de "humano assumiu"
// que ja existe pra quando alguem responde direto pela Meta Business Suite.
conversasRouter.post(
  "/:conversaId/mensagens",
  asyncHandler(async (req, res) => {
    const { texto } = enviarMensagemSchema.parse(req.body);
    const [conversa] = await db
      .select()
      .from(conversas)
      .where(and(eq(conversas.id, req.params.conversaId), eq(conversas.unidadeId, req.unidadeId!)))
      .limit(1);
    if (!conversa) throw new RecursoNaoEncontradoError("Conversa nao encontrada");

    let mensagem;
    try {
      mensagem = await enviarRespostaDoAgente(db, {
        unidadeId: req.unidadeId!,
        igSenderId: conversa.igSenderId,
        conversaId: conversa.id,
        texto,
        enviadoPorHumano: true,
      });
    } catch (err) {
      throw new RequisicaoInvalidaError(
        err instanceof Error ? `Nao foi possivel enviar a mensagem: ${err.message}` : "Nao foi possivel enviar a mensagem.",
      );
    }

    if (!conversa.agentPaused) {
      await db.update(conversas).set({ agentPaused: true, ultimaAtividadeHumanaEm: new Date() }).where(eq(conversas.id, conversa.id));
    }

    res.status(201).json(mensagem);
  }),
);

const atualizarConversaSchema = z.object({ agentPaused: z.boolean() });

// Fecha o loop de "pausar respostas automaticas ate reativacao manual": o dono do
// restaurante reativa o agente por aqui depois de assumir uma conversa pela Meta
// Business Suite (ou pausa manualmente, se quiser assumir sem esperar o cliente escrever).
conversasRouter.patch(
  "/:conversaId",
  asyncHandler(async (req, res) => {
    const { agentPaused } = atualizarConversaSchema.parse(req.body);
    const [conversa] = await db
      .update(conversas)
      .set({ agentPaused })
      .where(and(eq(conversas.id, req.params.conversaId), eq(conversas.unidadeId, req.unidadeId!)))
      .returning();
    if (!conversa) throw new RecursoNaoEncontradoError("Conversa nao encontrada");
    res.json(conversa);
  }),
);
