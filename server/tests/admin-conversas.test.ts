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
  obterPerfilInstagram: vi.fn(async () => ({ nome: null, fotoUrl: null })),
  InstagramAuthError: class InstagramAuthError extends Error {},
}));

const { enviarMensagemInstagram, obterPerfilInstagram } = await import("../src/lib/instagram-api.js");
const { createApp } = await import("../src/app.js");
const app = createApp();

beforeEach(async () => {
  await truncateAll();
  vi.mocked(enviarMensagemInstagram).mockReset().mockResolvedValue("mid-resposta-humana");
  vi.mocked(obterPerfilInstagram).mockReset().mockResolvedValue({ nome: null, fotoUrl: null });
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

describe("GET /admin/unidades/:id/conversas - backfill de perfil (doc 33)", () => {
  it("preenche nome/foto de uma conversa antiga que ainda nao tem, em segundo plano", async () => {
    const { empresa, unidade, usuario, senhaAdmin } = await criarEmpresaComAdmin();
    await criarConexaoInstagram(empresa.id, unidade.id, "ig-conta-restaurante");
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-antigo");
    const token = await login(app, usuario.email, senhaAdmin);
    vi.mocked(obterPerfilInstagram).mockResolvedValueOnce({ nome: "Cliente Antigo", fotoUrl: "https://cdn.example/antigo.jpg" });

    const res = await request(app).get(`/admin/unidades/${unidade.id}/conversas`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    // A resposta em si nao espera o backfill (dispara em segundo plano) - da um tempo
    // pro update assincrono terminar antes de checar o banco.
    await new Promise((resolve) => setTimeout(resolve, 100));

    const [atualizada] = await db.select().from(conversas).where(eq(conversas.id, conversa.id));
    expect(atualizada.nomeCliente).toBe("Cliente Antigo");
    expect(atualizada.fotoClienteUrl).toBe("https://cdn.example/antigo.jpg");
  });

  it("nao tenta buscar perfil de novo pra conversa que ja tem nome/foto", async () => {
    const { empresa, unidade, usuario, senhaAdmin } = await criarEmpresaComAdmin();
    await criarConexaoInstagram(empresa.id, unidade.id, "ig-conta-restaurante");
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-ja-tem-perfil");
    await db.update(conversas).set({ nomeCliente: "Ja Preenchido" }).where(eq(conversas.id, conversa.id));
    const token = await login(app, usuario.email, senhaAdmin);

    const res = await request(app).get(`/admin/unidades/${unidade.id}/conversas`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(obterPerfilInstagram).not.toHaveBeenCalled();
  });
});

describe("GET /admin/unidades/:id/conversas - preview da ultima mensagem (doc 34)", () => {
  it("mostra a ultima mensagem de cada conversa e ordena da mais recente pra mais antiga", async () => {
    const { empresa, unidade, usuario, senhaAdmin } = await criarEmpresaComAdmin();
    const conversaAntiga = await criarConversa(empresa.id, unidade.id, "ig-cliente-antiga");
    const conversaRecente = await criarConversa(empresa.id, unidade.id, "ig-cliente-recente");
    const token = await login(app, usuario.email, senhaAdmin);

    await db.insert(mensagens).values([
      { conversaId: conversaAntiga.id, papel: "user", conteudo: "Oi, tudo bem?", criadoEm: new Date("2026-01-01T10:00:00Z") },
      { conversaId: conversaAntiga.id, papel: "assistant", conteudo: "Tudo sim, como posso ajudar?", criadoEm: new Date("2026-01-01T10:01:00Z") },
      { conversaId: conversaRecente.id, papel: "user", conteudo: "Quero reservar mesa pra hoje", criadoEm: new Date("2026-01-02T10:00:00Z") },
    ]);

    const res = await request(app).get(`/admin/unidades/${unidade.id}/conversas`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].id).toBe(conversaRecente.id);
    expect(res.body[0].ultimaMensagem).toBe("Quero reservar mesa pra hoje");
    expect(res.body[1].id).toBe(conversaAntiga.id);
    expect(res.body[1].ultimaMensagem).toBe("Tudo sim, como posso ajudar?");
  });

  it("conversa sem nenhuma mensagem ainda vem com ultimaMensagem nula", async () => {
    const { empresa, unidade, usuario, senhaAdmin } = await criarEmpresaComAdmin();
    await criarConversa(empresa.id, unidade.id, "ig-cliente-sem-msg");
    const token = await login(app, usuario.email, senhaAdmin);

    const res = await request(app).get(`/admin/unidades/${unidade.id}/conversas`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body[0].ultimaMensagem).toBeNull();
  });
});
