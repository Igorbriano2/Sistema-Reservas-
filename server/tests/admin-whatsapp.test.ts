import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { db } from "../src/db/client.js";
import { feedbacks, mensagensMarketingLog } from "../src/db/schema/index.js";
import { closeDb, criarEmpresaComAdmin, criarFuncionario, truncateAll } from "./helpers/db.js";
import { login } from "./helpers/auth.js";
import { criarConexaoWhatsapp, criarMesa, criarReservaDireta, criarSalao } from "./helpers/fixtures.js";

const app = createApp();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

async function setup() {
  const empresa = await criarEmpresaComAdmin();
  const token = await login(app, empresa.usuario.email, empresa.senhaAdmin);
  return { ...empresa, token };
}

describe("GET /admin/whatsapp/connection", () => {
  it("retorna lista vazia quando a empresa nunca conectou", async () => {
    const { token } = await setup();
    const res = await request(app).get("/admin/whatsapp/connection").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("lista a conexao ativa sem expor o access_token_encrypted", async () => {
    const { empresa, token } = await setup();
    await criarConexaoWhatsapp(empresa.id, null, "waba-abc", "phone-abc");

    const res = await request(app).get("/admin/whatsapp/connection").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].wabaId).toBe("waba-abc");
    expect(res.body[0].phoneNumberId).toBe("phone-abc");
    expect(res.body[0].status).toBe("ativo");
    expect(res.body[0]).not.toHaveProperty("accessTokenEncrypted");
  });

  it("funcionario nao pode ver a conexao (owner-only)", async () => {
    const { empresa } = await setup();
    const funcionario = await criarFuncionario(empresa.id);
    const tokenFuncionario = await login(app, funcionario.usuario.email, funcionario.senha);

    const res = await request(app).get("/admin/whatsapp/connection").set("Authorization", `Bearer ${tokenFuncionario}`);
    expect(res.status).toBe(403);
  });
});

describe("GET/PATCH /admin/whatsapp/config", () => {
  it("config comeca com os defaults (todas campanhas ativas, 60 dias de inatividade)", async () => {
    const { token } = await setup();
    const res = await request(app).get("/admin/whatsapp/config").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.feedbackAtivo).toBe(true);
    expect(res.body.aniversarioAtivo).toBe(true);
    expect(res.body.recuperacaoAtivo).toBe(true);
    expect(res.body.diasInatividadeRecuperacao).toBe(60);
  });

  it("permite desligar cada campanha individualmente e customizar textos/dias", async () => {
    const { token } = await setup();
    const res = await request(app)
      .patch("/admin/whatsapp/config")
      .set("Authorization", `Bearer ${token}`)
      .send({
        aniversarioAtivo: false,
        textoAniversario: "Feliz aniversario!",
        diasInatividadeRecuperacao: 90,
      });
    expect(res.status).toBe(200);
    expect(res.body.aniversarioAtivo).toBe(false);
    expect(res.body.feedbackAtivo).toBe(true);
    expect(res.body.textoAniversario).toBe("Feliz aniversario!");
    expect(res.body.diasInatividadeRecuperacao).toBe(90);
  });

  it("funcionario nao pode alterar a config (owner-only)", async () => {
    const { empresa } = await setup();
    const funcionario = await criarFuncionario(empresa.id);
    const tokenFuncionario = await login(app, funcionario.usuario.email, funcionario.senha);

    const res = await request(app)
      .patch("/admin/whatsapp/config")
      .set("Authorization", `Bearer ${tokenFuncionario}`)
      .send({ feedbackAtivo: false });
    expect(res.status).toBe(403);
  });
});

describe("GET /admin/whatsapp/feedbacks", () => {
  it("lista feedbacks com nome do cliente e dados da reserva, acessivel a owner e funcionario", async () => {
    const { empresa, unidade, token } = await setup();
    const salao = await criarSalao(unidade.id);
    const mesa = await criarMesa(salao.id, { capacidadeMin: 1, capacidadeMax: 4 });
    const reserva = await criarReservaDireta(unidade.id, mesa.id, "ig-fb", { clienteNome: "Cliente Nota Boa" });
    await db.insert(mensagensMarketingLog).values({
      empresaId: empresa.id,
      reservaId: reserva.id,
      clienteTelefone: "11900001111",
      tipo: "feedback",
      templateUsado: "feedback_pos_reserva",
      status: "enviado",
    });
    await db.insert(feedbacks).values({
      reservaId: reserva.id,
      empresaId: empresa.id,
      clienteTelefone: "11900001111",
      nota: 5,
      comentarioTexto: "Excelente!",
    });

    const res = await request(app).get("/admin/whatsapp/feedbacks").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].nota).toBe(5);
    expect(res.body[0].comentarioTexto).toBe("Excelente!");
    expect(res.body[0].clienteNome).toBe("Cliente Nota Boa");

    const funcionario = await criarFuncionario(empresa.id);
    const tokenFuncionario = await login(app, funcionario.usuario.email, funcionario.senha);
    const resFuncionario = await request(app).get("/admin/whatsapp/feedbacks").set("Authorization", `Bearer ${tokenFuncionario}`);
    expect(resFuncionario.status).toBe(200);
    expect(resFuncionario.body).toHaveLength(1);
  });

  it("nao mostra feedback de outra empresa (isolamento multi-tenant)", async () => {
    const { token } = await setup();
    const outraEmpresa = await criarEmpresaComAdmin({ nomeEmpresa: "Outra Empresa", emailAdmin: "admin-outra@teste.com" });
    const outroSalao = await criarSalao(outraEmpresa.unidade.id);
    const outraMesa = await criarMesa(outroSalao.id, { capacidadeMin: 1, capacidadeMax: 4 });
    const outraReserva = await criarReservaDireta(outraEmpresa.unidade.id, outraMesa.id, "ig-outra");
    await db.insert(feedbacks).values({
      reservaId: outraReserva.id,
      empresaId: outraEmpresa.empresa.id,
      clienteTelefone: "11999998888",
      nota: 1,
    });

    const res = await request(app).get("/admin/whatsapp/feedbacks").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});
