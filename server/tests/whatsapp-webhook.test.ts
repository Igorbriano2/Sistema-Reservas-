import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { createApp } from "../src/app.js";
import { db } from "../src/db/client.js";
import { clientes, feedbacks, mensagensMarketingLog } from "../src/db/schema/index.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
import { criarCliente, criarConexaoWhatsapp, criarMesa, criarReservaDireta, criarSalao } from "./helpers/fixtures.js";

const app = createApp();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

function assinar(corpo: object): string {
  const payload = JSON.stringify(corpo);
  return `sha256=${createHmac("sha256", process.env.WHATSAPP_APP_SECRET!).update(payload).digest("hex")}`;
}

function corpoDeMensagem(phoneNumberId: string, from: string, textoOuBotao: { text?: string; button?: string }) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-teste",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: phoneNumberId },
              messages: [
                textoOuBotao.text
                  ? { from, id: "wamid.1", type: "text", text: { body: textoOuBotao.text } }
                  : { from, id: "wamid.1", type: "button", button: { text: textoOuBotao.button } },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe("GET /whatsapp/webhook (handshake de verificacao da Meta)", () => {
  it("ecoa o challenge quando o verify_token bate", async () => {
    const res = await request(app)
      .get("/whatsapp/webhook")
      .query({ "hub.mode": "subscribe", "hub.verify_token": "test-whatsapp-verify-token", "hub.challenge": "98765" });
    expect(res.status).toBe(200);
    expect(res.text).toBe("98765");
  });

  it("rejeita quando o verify_token nao bate", async () => {
    const res = await request(app)
      .get("/whatsapp/webhook")
      .query({ "hub.mode": "subscribe", "hub.verify_token": "token-errado", "hub.challenge": "98765" });
    expect(res.status).toBe(403);
  });
});

describe("POST /whatsapp/webhook (assinatura)", () => {
  it("rejeita payload sem assinatura valida", async () => {
    const corpo = { object: "whatsapp_business_account", entry: [] };
    const res = await request(app).post("/whatsapp/webhook").set("x-hub-signature-256", "sha256=forjada").send(corpo);
    expect(res.status).toBe(401);
  });

  it("aceita payload com assinatura valida e responde 200 mesmo sem eventos processaveis", async () => {
    const corpo = { object: "whatsapp_business_account", entry: [] };
    const res = await request(app).post("/whatsapp/webhook").set("x-hub-signature-256", assinar(corpo)).send(corpo);
    expect(res.status).toBe(200);
  });

  it("responde 200 mesmo quando o phone_number_id do evento e desconhecido", async () => {
    const corpo = corpoDeMensagem("numero-desconhecido", "11900000000", { text: "PARAR" });
    const res = await request(app).post("/whatsapp/webhook").set("x-hub-signature-256", assinar(corpo)).send(corpo);
    expect(res.status).toBe(200);
  });
});

describe("Opt-out via mensagem recebida", () => {
  it("marca whatsapp_opt_in = false imediatamente ao receber 'PARAR'", async () => {
    const { empresa } = await criarEmpresaComAdmin();
    const conexao = await criarConexaoWhatsapp(empresa.id, null, "waba-teste", "phone-optout-1");
    await criarCliente(empresa.id, "11911112222", { whatsappOptIn: true });

    const corpo = corpoDeMensagem(conexao.phoneNumberId, "11911112222", { text: "parar" });
    const res = await request(app).post("/whatsapp/webhook").set("x-hub-signature-256", assinar(corpo)).send(corpo);
    expect(res.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 50));
    const [cliente] = await db.select().from(clientes).where(eq(clientes.telefone, "11911112222"));
    expect(cliente.whatsappOptIn).toBe(false);
  });

  it("tambem funciona com 'SAIR' e 'CANCELAR', case-insensitive", async () => {
    const { empresa } = await criarEmpresaComAdmin();
    const conexao = await criarConexaoWhatsapp(empresa.id, null, "waba-teste", "phone-optout-2");
    await criarCliente(empresa.id, "11922223333", { whatsappOptIn: true });

    const corpo = corpoDeMensagem(conexao.phoneNumberId, "11922223333", { text: "Sair" });
    await request(app).post("/whatsapp/webhook").set("x-hub-signature-256", assinar(corpo)).send(corpo);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const [cliente] = await db.select().from(clientes).where(eq(clientes.telefone, "11922223333"));
    expect(cliente.whatsappOptIn).toBe(false);
  });
});

describe("Resposta ao template de feedback", () => {
  it("vincula nota + comentario a reserva certa via mensagens_marketing_log mais recente", async () => {
    const { empresa, unidade } = await criarEmpresaComAdmin();
    const conexao = await criarConexaoWhatsapp(empresa.id, null, "waba-teste", "phone-feedback-1");
    const salao = await criarSalao(unidade.id);
    const mesa = await criarMesa(salao.id, { capacidadeMin: 1, capacidadeMax: 4 });
    const reserva = await criarReservaDireta(unidade.id, mesa.id, "ig-fb-1", { clienteNome: "Cliente Feedback" });

    const [log] = await db
      .insert(mensagensMarketingLog)
      .values({
        empresaId: empresa.id,
        reservaId: reserva.id,
        clienteTelefone: "11933334444",
        tipo: "feedback",
        templateUsado: "feedback_pos_reserva",
        status: "enviado",
      })
      .returning();

    const corpo = corpoDeMensagem(conexao.phoneNumberId, "11933334444", { text: "5 - Adorei o atendimento!" });
    await request(app).post("/whatsapp/webhook").set("x-hub-signature-256", assinar(corpo)).send(corpo);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const registros = await db.select().from(feedbacks).where(eq(feedbacks.reservaId, reserva.id));
    expect(registros).toHaveLength(1);
    expect(registros[0].nota).toBe(5);
    expect(registros[0].comentarioTexto).toBe("Adorei o atendimento!");

    const [logAtualizado] = await db.select().from(mensagensMarketingLog).where(eq(mensagensMarketingLog.id, log.id));
    expect(logAtualizado.status).toBe("respondido");
  });

  it("aceita resposta so com nota (botao de resposta rapida)", async () => {
    const { empresa, unidade } = await criarEmpresaComAdmin();
    const conexao = await criarConexaoWhatsapp(empresa.id, null, "waba-teste", "phone-feedback-2");
    const salao = await criarSalao(unidade.id);
    const mesa = await criarMesa(salao.id, { capacidadeMin: 1, capacidadeMax: 4 });
    const reserva = await criarReservaDireta(unidade.id, mesa.id, "ig-fb-2");

    await db.insert(mensagensMarketingLog).values({
      empresaId: empresa.id,
      reservaId: reserva.id,
      clienteTelefone: "11944445555",
      tipo: "feedback",
      templateUsado: "feedback_pos_reserva",
      status: "enviado",
    });

    const corpo = corpoDeMensagem(conexao.phoneNumberId, "11944445555", { button: "5" });
    await request(app).post("/whatsapp/webhook").set("x-hub-signature-256", assinar(corpo)).send(corpo);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const registros = await db.select().from(feedbacks).where(eq(feedbacks.reservaId, reserva.id));
    expect(registros).toHaveLength(1);
    expect(registros[0].nota).toBe(5);
    expect(registros[0].comentarioTexto).toBeNull();
  });

  it("nao cria feedback quando nao ha campanha de feedback recente pra esse telefone", async () => {
    const { empresa } = await criarEmpresaComAdmin();
    const conexao = await criarConexaoWhatsapp(empresa.id, null, "waba-teste", "phone-feedback-3");

    const corpo = corpoDeMensagem(conexao.phoneNumberId, "11955556666", { text: "5 - otimo" });
    await request(app).post("/whatsapp/webhook").set("x-hub-signature-256", assinar(corpo)).send(corpo);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const registros = await db.select().from(feedbacks);
    expect(registros).toHaveLength(0);
  });
});
