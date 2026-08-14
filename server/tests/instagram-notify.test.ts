import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { conversas, mensagens } from "../src/db/schema/index.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
import { criarConexaoInstagram, criarConversa } from "./helpers/fixtures.js";

vi.mock("../src/lib/instagram-api.js", () => ({
  enviarMensagemInstagram: vi.fn(),
  InstagramAuthError: class InstagramAuthError extends Error {},
}));

const { enviarMensagemInstagram } = await import("../src/lib/instagram-api.js");
const { enviarRespostaDoAgente } = await import("../src/lib/instagram-notify.js");

beforeEach(async () => {
  await truncateAll();
  vi.mocked(enviarMensagemInstagram).mockReset().mockResolvedValue("mid-corrida-1");
});

afterAll(async () => {
  await closeDb();
});

// Corrida real vista em producao (log da DigitalOcean): o webhook de echo do PROPRIO
// envio do agente as vezes e processado ANTES do guard em memoria (marcarComoEnviado
// PeloAgente) ser armado - o echo entao trata o mid como se fosse um humano, grava a
// linha com enviadoPorHumano=true e PAUSA a conversa. Quando enviarRespostaDoAgente
// tenta gravar a SUA propria linha logo em seguida, colidia com a unique constraint
// (ig_message_id) e derrubava o turno inteiro com um erro nao tratado.
describe("lib/instagram-notify enviarRespostaDoAgente - corrida com o echo do proprio envio", () => {
  it("nao lanca quando a linha ja foi gravada pelo echo (mesmo ig_message_id) - corrige enviadoPorHumano e reabre a conversa", async () => {
    const { empresa, unidade } = await criarEmpresaComAdmin();
    await criarConexaoInstagram(empresa.id, unidade.id, "ig-conta-restaurante");
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");

    // Simula o echo vencendo a corrida: grava a mesma mensagem com o MESMO mid que
    // enviarRespostaDoAgente vai tentar gravar, marcando (errado) como humano + pausa.
    await db.insert(mensagens).values({
      conversaId: conversa.id,
      papel: "assistant",
      conteudo: "Boa tarde! Voce prefere a unidade de Londrina ou de Maringa?",
      igMessageId: "mid-corrida-1",
      enviadoPorHumano: true,
    });
    await db.update(conversas).set({ agentPaused: true }).where(eq(conversas.id, conversa.id));

    const resultado = await enviarRespostaDoAgente(db, {
      unidadeId: unidade.id,
      igSenderId: "ig-cliente-1",
      conversaId: conversa.id,
      texto: "Boa tarde! Voce prefere a unidade de Londrina ou de Maringa?",
    });

    expect(resultado.enviadoPorHumano).toBe(false);

    const linhas = await db.select().from(mensagens).where(eq(mensagens.conversaId, conversa.id));
    expect(linhas).toHaveLength(1); // nao duplicou a linha
    expect(linhas[0].enviadoPorHumano).toBe(false);

    const [conversaAtualizada] = await db.select().from(conversas).where(eq(conversas.id, conversa.id));
    expect(conversaAtualizada.agentPaused).toBe(false); // reabre a conversa pro agente continuar
  });

  it("nao reabre a conversa quando a chamada era mesmo de um humano (dono/funcionario, doc 31)", async () => {
    const { empresa, unidade } = await criarEmpresaComAdmin();
    await criarConexaoInstagram(empresa.id, unidade.id, "ig-conta-restaurante");
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");

    await db.insert(mensagens).values({
      conversaId: conversa.id,
      papel: "assistant",
      conteudo: "Resposta manual",
      igMessageId: "mid-corrida-1",
      enviadoPorHumano: true,
    });
    await db.update(conversas).set({ agentPaused: true }).where(eq(conversas.id, conversa.id));

    const resultado = await enviarRespostaDoAgente(db, {
      unidadeId: unidade.id,
      igSenderId: "ig-cliente-1",
      conversaId: conversa.id,
      texto: "Resposta manual",
      enviadoPorHumano: true,
    });

    expect(resultado.enviadoPorHumano).toBe(true);
    const [conversaAtualizada] = await db.select().from(conversas).where(eq(conversas.id, conversa.id));
    expect(conversaAtualizada.agentPaused).toBe(true); // continua pausada (era mesmo humano)
  });

  it("sem corrida (caso normal), grava a propria linha normalmente", async () => {
    const { empresa, unidade } = await criarEmpresaComAdmin();
    await criarConexaoInstagram(empresa.id, unidade.id, "ig-conta-restaurante");
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");

    const resultado = await enviarRespostaDoAgente(db, {
      unidadeId: unidade.id,
      igSenderId: "ig-cliente-1",
      conversaId: conversa.id,
      texto: "Oi! Como posso ajudar?",
    });

    expect(resultado.conteudo).toBe("Oi! Como posso ajudar?");
    expect(resultado.enviadoPorHumano).toBe(false);
    expect(resultado.igMessageId).toBe("mid-corrida-1");
  });
});
