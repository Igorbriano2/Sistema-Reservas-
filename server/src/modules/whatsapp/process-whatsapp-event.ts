import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { clientes, feedbacks, mensagensMarketingLog, whatsappConnections } from "../../db/schema/index.js";

export interface WhatsappIncomingMessage {
  from: string;
  type: string;
  text?: { body: string };
  button?: { text: string };
  interactive?: { button_reply?: { title: string } };
}

export interface WhatsappChangeValue {
  metadata?: { phone_number_id?: string };
  messages?: WhatsappIncomingMessage[];
}

// Opt-out precisa funcionar mesmo se o cliente responder com acentos/maiusculas
// diferentes - normaliza antes de comparar (a lista cobre as variacoes mais comuns,
// nao um dicionario NLP completo).
const PALAVRAS_OPT_OUT = new Set(["parar", "sair", "cancelar", "stop", "unsubscribe"]);

function extrairTexto(msg: WhatsappIncomingMessage): string {
  return msg.text?.body ?? msg.button?.text ?? msg.interactive?.button_reply?.title ?? "";
}

// Extrai nota (1-5) e/ou comentario livre de uma resposta ao template de feedback.
// So o digito ("5") -> nota sem comentario. Digito seguido de texto ("5 - adorei!")
// -> os dois. Sem digito no inicio -> tudo vira comentario, nota fica nula (nao
// tenta adivinhar nota a partir de texto livre).
export function interpretarRespostaFeedback(texto: string): { nota: number | null; comentario: string | null } {
  if (/^[1-5]$/.test(texto)) {
    return { nota: Number(texto), comentario: null };
  }
  const match = texto.match(/^([1-5])\s*[-:.]?\s*(.*)$/);
  if (match) {
    const resto = match[2].trim();
    return { nota: Number(match[1]), comentario: resto || null };
  }
  return { nota: null, comentario: texto };
}

async function tratarPossivelRespostaDeFeedback(db: Database, empresaId: string, telefone: string, texto: string): Promise<void> {
  const [logRecente] = await db
    .select()
    .from(mensagensMarketingLog)
    .where(
      and(
        eq(mensagensMarketingLog.empresaId, empresaId),
        eq(mensagensMarketingLog.clienteTelefone, telefone),
        eq(mensagensMarketingLog.tipo, "feedback"),
      ),
    )
    .orderBy(desc(mensagensMarketingLog.enviadoEm))
    .limit(1);
  // Sem campanha de feedback recente pra esse telefone (ou sem reserva vinculada -
  // nunca deveria acontecer pro tipo "feedback", ver whatsapp-scheduler.ts) - nao ha
  // o que fazer com essa mensagem.
  if (!logRecente || !logRecente.reservaId) return;

  const { nota, comentario } = interpretarRespostaFeedback(texto);

  await db.insert(feedbacks).values({
    reservaId: logRecente.reservaId,
    empresaId,
    clienteTelefone: telefone,
    nota,
    comentarioTexto: comentario,
  });

  await db.update(mensagensMarketingLog).set({ status: "respondido" }).where(eq(mensagensMarketingLog.id, logRecente.id));
}

// Processa um "value" do webhook (ja filtrado pra field === "messages" no route
// handler) - resolve a empresa pelo phone_number_id do proprio numero conectado
// (nunca confia em nada do corpo pra isso) e trata opt-out / resposta de feedback.
export async function processarEventoDoWhatsapp(db: Database, valor: WhatsappChangeValue): Promise<void> {
  const phoneNumberId = valor.metadata?.phone_number_id;
  const mensagens = valor.messages ?? [];
  if (!phoneNumberId || mensagens.length === 0) return;

  const [conexao] = await db.select().from(whatsappConnections).where(eq(whatsappConnections.phoneNumberId, phoneNumberId)).limit(1);
  if (!conexao) return;

  for (const msg of mensagens) {
    const telefone = msg.from;
    const texto = extrairTexto(msg).trim();
    if (!telefone || !texto) continue;

    if (PALAVRAS_OPT_OUT.has(texto.toLowerCase())) {
      await db
        .update(clientes)
        .set({ whatsappOptIn: false })
        .where(and(eq(clientes.empresaId, conexao.empresaId), eq(clientes.telefone, telefone)));
      continue;
    }

    await tratarPossivelRespostaDeFeedback(db, conexao.empresaId, telefone, texto);
  }
}
