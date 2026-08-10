import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import request from "supertest";
import { db } from "../src/db/client.js";
import { conversas, mensagens } from "../src/db/schema/index.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
import { criarConexaoInstagram, criarConversa } from "./helpers/fixtures.js";
import { login } from "./helpers/auth.js";

vi.mock("../src/lib/instagram-api.js", () => ({
  enviarMensagemInstagram: vi.fn(),
  InstagramAuthError: class InstagramAuthError extends Error {},
}));

const { enviarMensagemInstagram } = await import("../src/lib/instagram-api.js");
const { createApp } = await import("../src/app.js");
const app = createApp();

beforeEach(async () => {
  await truncateAll();
  vi.mocked(enviarMensagemInstagram).mockReset().mockResolvedValue("mid-resposta-humana");
});

afterAll(async () => {
  await closeDb();
});

describe("Admin - conversas (reativacao manual do agente)", () => {
  it("lista conversas da unidade e reativa uma conversa pausada", async () => {
    const { empresa, unidade, usuario, senhaAdmin } = await criarEmpresaComAdmin();
    const token = await login(app, usuario.email, senhaAdmin);
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");

    const pausar = await request(app)
      .patch(`/admin/unidades/${unidade.id}/conversas/${conversa.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ agentPaused: true });
    expect(pausar.status).toBe(200);
    expect(pausar.body.agentPaused).toBe(true);

    const lista = await request(app)
      .get(`/admin/unidades/${unidade.id}/conversas`)
      .set("Authorization", `Bearer ${token}`);
    expect(lista.body).toHaveLength(1);
    expect(lista.body[0].agentPaused).toBe(true);

    const reativar = await request(app)
      .patch(`/admin/unidades/${unidade.id}/conversas/${conversa.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ agentPaused: false });
    expect(reativar.status).toBe(200);
    expect(reativar.body.agentPaused).toBe(false);
  });

  it("nao permite reativar/ver conversa de outra empresa", async () => {
    const empresaA = await criarEmpresaComAdmin({ nomeEmpresa: "A", emailAdmin: "a@a.com", senhaAdmin: "senha-a-123" });
    const empresaB = await criarEmpresaComAdmin({ nomeEmpresa: "B", emailAdmin: "b@b.com", senhaAdmin: "senha-b-123" });
    const conversaDeA = await criarConversa(empresaA.empresa.id, empresaA.unidade.id, "ig-cliente-1");
    const tokenB = await login(app, empresaB.usuario.email, empresaB.senhaAdmin);

    const tentativa = await request(app)
      .patch(`/admin/unidades/${empresaB.unidade.id}/conversas/${conversaDeA.id}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ agentPaused: false });
    expect(tentativa.status).toBe(404);

    const listaB = await request(app)
      .get(`/admin/unidades/${empresaB.unidade.id}/conversas`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(listaB.body).toHaveLength(0);
  });
});

describe("POST /admin/unidades/:id/conversas/:conversaId/mensagens (doc 31 - resposta manual pelo painel)", () => {
  it("envia pelo Instagram de verdade, grava no historico com enviadoPorHumano=true, e pausa o agente", async () => {
    const { empresa, unidade, usuario, senhaAdmin } = await criarEmpresaComAdmin();
    await criarConexaoInstagram(empresa.id, unidade.id, "ig-conta-restaurante");
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");
    const token = await login(app, usuario.email, senhaAdmin);

    const res = await request(app)
      .post(`/admin/unidades/${unidade.id}/conversas/${conversa.id}/mensagens`)
      .set("Authorization", `Bearer ${token}`)
      .send({ texto: "Oi! Aqui e o gerente, como posso ajudar?" });

    expect(res.status).toBe(201);
    expect(res.body.conteudo).toBe("Oi! Aqui e o gerente, como posso ajudar?");
    expect(res.body.enviadoPorHumano).toBe(true);
    expect(enviarMensagemInstagram).toHaveBeenCalledWith(expect.any(String), "ig-cliente-1", "Oi! Aqui e o gerente, como posso ajudar?");

    const [linha] = await db.select().from(mensagens).where(eq(mensagens.conversaId, conversa.id));
    expect(linha.papel).toBe("assistant");
    expect(linha.enviadoPorHumano).toBe(true);
    expect(linha.igMessageId).toBe("mid-resposta-humana");

    const [conversaAtualizada] = await db.select().from(conversas).where(eq(conversas.id, conversa.id));
    expect(conversaAtualizada.agentPaused).toBe(true);
  });

  it("devolve erro claro (nao 500) quando nao ha conexao ativa do Instagram pra essa unidade", async () => {
    const { empresa, unidade, usuario, senhaAdmin } = await criarEmpresaComAdmin();
    // Sem criarConexaoInstagram de proposito - simula unidade que nunca conectou.
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");
    const token = await login(app, usuario.email, senhaAdmin);

    const res = await request(app)
      .post(`/admin/unidades/${unidade.id}/conversas/${conversa.id}/mensagens`)
      .set("Authorization", `Bearer ${token}`)
      .send({ texto: "Oi!" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/nao foi possivel enviar/i);
  });

  it("nao permite responder conversa de outra empresa", async () => {
    const empresaA = await criarEmpresaComAdmin({ nomeEmpresa: "A2", emailAdmin: "a2@a.com", senhaAdmin: "senha-a-123" });
    const empresaB = await criarEmpresaComAdmin({ nomeEmpresa: "B2", emailAdmin: "b2@b.com", senhaAdmin: "senha-b-123" });
    const conversaDeA = await criarConversa(empresaA.empresa.id, empresaA.unidade.id, "ig-cliente-1");
    const tokenB = await login(app, empresaB.usuario.email, empresaB.senhaAdmin);

    const res = await request(app)
      .post(`/admin/unidades/${empresaB.unidade.id}/conversas/${conversaDeA.id}/mensagens`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ texto: "Oi!" });
    expect(res.status).toBe(404);
  });

  it("rejeita texto vazio", async () => {
    const { empresa, unidade, usuario, senhaAdmin } = await criarEmpresaComAdmin();
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");
    const token = await login(app, usuario.email, senhaAdmin);

    const res = await request(app)
      .post(`/admin/unidades/${unidade.id}/conversas/${conversa.id}/mensagens`)
      .set("Authorization", `Bearer ${token}`)
      .send({ texto: "" });
    expect(res.status).toBe(400);
  });
});
