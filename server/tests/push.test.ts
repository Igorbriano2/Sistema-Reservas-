import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import request from "supertest";
import { db } from "../src/db/client.js";
import { pushSubscricoes } from "../src/db/schema/index.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
import { criarMesa, criarRegraHorarioTodosOsDias, criarReservaDireta, criarSalao } from "./helpers/fixtures.js";
import { login } from "./helpers/auth.js";

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn().mockResolvedValue({ statusCode: 201 }),
  },
}));

vi.mock("../src/lib/instagram-api.js", () => ({
  enviarMensagemInstagram: vi.fn(),
  verificarAssinaturaDoWebhook: vi.fn(() => true),
}));

const webpush = (await import("web-push")).default;
const { createApp } = await import("../src/app.js");
const { gerarTokenDeReserva } = await import("../src/lib/reservation-link.js");
const { executarTool } = await import("../src/modules/agent/tool-executor.js");
const app = createApp();

const SUBSCRIPTION_EXEMPLO = {
  endpoint: "https://fcm.googleapis.com/fcm/send/exemplo-abc123",
  keys: { p256dh: "chave-p256dh-exemplo", auth: "chave-auth-exemplo" },
};

beforeEach(async () => {
  await truncateAll();
  vi.mocked(webpush.sendNotification).mockClear().mockResolvedValue({ statusCode: 201 } as never);
});

afterAll(async () => {
  await closeDb();
});

let contadorUnidades = 0;

async function setupUnidadeCompleta() {
  contadorUnidades += 1;
  const { empresa, unidade, usuario, senhaAdmin } = await criarEmpresaComAdmin({
    nomeEmpresa: `Empresa Teste ${contadorUnidades}`,
    emailAdmin: `admin${contadorUnidades}@teste.com`,
  });
  const salao = await criarSalao(unidade.id);
  const mesa = await criarMesa(salao.id, { capacidadeMin: 1, capacidadeMax: 4 });
  await criarRegraHorarioTodosOsDias(unidade.id);
  const token = await login(app, usuario.email, senhaAdmin);
  return { empresa, unidade, usuario, mesa, token };
}

describe("GET /admin/unidades/:id/push/chave-publica", () => {
  it("devolve a chave publica VAPID configurada no ambiente", async () => {
    const { unidade, token } = await setupUnidadeCompleta();
    const res = await request(app)
      .get(`/admin/unidades/${unidade.id}/push/chave-publica`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.chavePublica).toBe(process.env.VAPID_PUBLIC_KEY);
  });
});

describe("POST /admin/unidades/:id/push (inscricao)", () => {
  it("inscreve o dispositivo e persiste no banco", async () => {
    const { unidade, token } = await setupUnidadeCompleta();
    const res = await request(app)
      .post(`/admin/unidades/${unidade.id}/push`)
      .set("Authorization", `Bearer ${token}`)
      .send(SUBSCRIPTION_EXEMPLO);
    expect(res.status).toBe(201);

    const [salvo] = await db.select().from(pushSubscricoes).where(eq(pushSubscricoes.endpoint, SUBSCRIPTION_EXEMPLO.endpoint));
    expect(salvo).toBeDefined();
    expect(salvo.unidadeId).toBe(unidade.id);
    expect(salvo.p256dh).toBe(SUBSCRIPTION_EXEMPLO.keys.p256dh);
  });

  it("reenviar o mesmo endpoint atualiza (upsert) em vez de duplicar", async () => {
    const { unidade, token } = await setupUnidadeCompleta();
    await request(app).post(`/admin/unidades/${unidade.id}/push`).set("Authorization", `Bearer ${token}`).send(SUBSCRIPTION_EXEMPLO);
    await request(app)
      .post(`/admin/unidades/${unidade.id}/push`)
      .set("Authorization", `Bearer ${token}`)
      .send({ ...SUBSCRIPTION_EXEMPLO, keys: { p256dh: "chave-nova", auth: "auth-nova" } });

    const linhas = await db.select().from(pushSubscricoes).where(eq(pushSubscricoes.endpoint, SUBSCRIPTION_EXEMPLO.endpoint));
    expect(linhas).toHaveLength(1);
    expect(linhas[0].p256dh).toBe("chave-nova");
  });

  it("exige autenticacao", async () => {
    const { unidade } = await setupUnidadeCompleta();
    const res = await request(app).post(`/admin/unidades/${unidade.id}/push`).send(SUBSCRIPTION_EXEMPLO);
    expect(res.status).toBe(401);
  });
});

describe("DELETE /admin/unidades/:id/push (desinscricao)", () => {
  it("remove a inscricao pelo endpoint", async () => {
    const { unidade, token } = await setupUnidadeCompleta();
    await request(app).post(`/admin/unidades/${unidade.id}/push`).set("Authorization", `Bearer ${token}`).send(SUBSCRIPTION_EXEMPLO);

    const res = await request(app)
      .delete(`/admin/unidades/${unidade.id}/push?endpoint=${encodeURIComponent(SUBSCRIPTION_EXEMPLO.endpoint)}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(204);

    const linhas = await db.select().from(pushSubscricoes).where(eq(pushSubscricoes.endpoint, SUBSCRIPTION_EXEMPLO.endpoint));
    expect(linhas).toHaveLength(0);
  });

  it("nao remove a inscricao de outra unidade mesmo sabendo o endpoint (isolamento multi-tenant)", async () => {
    const { unidade: unidadeA, token: tokenA } = await setupUnidadeCompleta();
    const { unidade: unidadeB, token: tokenB } = await setupUnidadeCompleta();
    await request(app).post(`/admin/unidades/${unidadeA.id}/push`).set("Authorization", `Bearer ${tokenA}`).send(SUBSCRIPTION_EXEMPLO);

    // tokenB tenta apagar via a PROPRIA unidade (unidadeB), mesmo sabendo o endpoint de A.
    await request(app)
      .delete(`/admin/unidades/${unidadeB.id}/push?endpoint=${encodeURIComponent(SUBSCRIPTION_EXEMPLO.endpoint)}`)
      .set("Authorization", `Bearer ${tokenB}`);

    const linhas = await db.select().from(pushSubscricoes).where(eq(pushSubscricoes.endpoint, SUBSCRIPTION_EXEMPLO.endpoint));
    expect(linhas).toHaveLength(1);
  });
});

describe("Push disparado em nova reserva publica", () => {
  it("envia notificacao pra todos os dispositivos inscritos da unidade quando uma reserva e criada pela pagina publica", async () => {
    const { unidade, mesa, token } = await setupUnidadeCompleta();
    await request(app).post(`/admin/unidades/${unidade.id}/push`).set("Authorization", `Bearer ${token}`).send(SUBSCRIPTION_EXEMPLO);

    const linkToken = gerarTokenDeReserva({ unidadeId: unidade.id, igSenderId: "ig-cliente-push" });
    const res = await request(app).post(`/public/reservation-link/${linkToken}/reservations`).send({
      data: "2026-11-05",
      horaInicio: "20:00",
      numPessoas: 2,
      clienteNome: "Cliente Push",
      mesaId: mesa.id,
    });
    expect(res.status).toBe(201);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    const [subscriptionArg, payloadArg] = vi.mocked(webpush.sendNotification).mock.calls[0];
    expect(subscriptionArg.endpoint).toBe(SUBSCRIPTION_EXEMPLO.endpoint);
    const payload = JSON.parse(payloadArg as string);
    expect(payload.titulo).toBe("Nova reserva");
    expect(payload.corpo).toContain("Cliente Push");
  });

  it("nao chama sendNotification quando nao ha nenhum dispositivo inscrito", async () => {
    const { unidade, mesa } = await setupUnidadeCompleta();
    const linkToken = gerarTokenDeReserva({ unidadeId: unidade.id, igSenderId: "ig-sem-inscricao" });
    const res = await request(app).post(`/public/reservation-link/${linkToken}/reservations`).send({
      data: "2026-11-06",
      horaInicio: "20:00",
      numPessoas: 2,
      clienteNome: "Cliente Sem Push",
      mesaId: mesa.id,
    });
    expect(res.status).toBe(201);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
});

describe("Push disparado em cancelamento pelo cliente (chat)", () => {
  it("envia notificacao quando cancel_my_reservation e executado", async () => {
    const { empresa, unidade, mesa, token } = await setupUnidadeCompleta();
    await request(app).post(`/admin/unidades/${unidade.id}/push`).set("Authorization", `Bearer ${token}`).send(SUBSCRIPTION_EXEMPLO);

    const reserva = await criarReservaDireta(unidade.id, mesa.id, "ig-cancelar-push", { clienteNome: "Cliente Cancelou" });
    const ctx = { empresaId: empresa.id, unidadeId: unidade.id, igSenderId: "ig-cancelar-push", conversaId: "conversa-teste" };

    const resultado = await executarTool(db, ctx, "cancel_my_reservation", { reservation_id: reserva.id });
    expect(resultado.isError).toBeFalsy();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    const [, payloadArg] = vi.mocked(webpush.sendNotification).mock.calls[0];
    const payload = JSON.parse(payloadArg as string);
    expect(payload.titulo).toBe("Reserva cancelada");
    expect(payload.corpo).toContain("Cliente Cancelou");
  });
});
