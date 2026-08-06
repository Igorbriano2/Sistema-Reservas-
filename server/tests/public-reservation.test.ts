import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import request from "supertest";
import { db } from "../src/db/client.js";
import { reservas } from "../src/db/schema/index.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
import { criarConexaoInstagram, criarConversa, criarMesa, criarRegraHorarioTodosOsDias, criarSalao } from "./helpers/fixtures.js";

vi.mock("../src/lib/instagram-api.js", () => ({
  enviarMensagemInstagram: vi.fn(),
  verificarAssinaturaDoWebhook: vi.fn(() => true),
}));

const { enviarMensagemInstagram } = await import("../src/lib/instagram-api.js");
const { createApp } = await import("../src/app.js");
const { gerarTokenDeReserva } = await import("../src/lib/reservation-link.js");

const app = createApp();

beforeEach(async () => {
  await truncateAll();
  vi.mocked(enviarMensagemInstagram).mockReset().mockResolvedValue("mid-confirmacao");
});

afterAll(async () => {
  await closeDb();
});

async function setupUnidadeCompleta() {
  const { empresa, unidade } = await criarEmpresaComAdmin();
  const salao = await criarSalao(unidade.id);
  const mesa = await criarMesa(salao.id, { capacidadeMin: 1, capacidadeMax: 4 });
  await criarRegraHorarioTodosOsDias(unidade.id);
  return { empresa, unidade, salao, mesa };
}

describe("GET /public/reservation-link/:token", () => {
  it("retorna o nome da unidade para um token valido", async () => {
    const { unidade } = await setupUnidadeCompleta();
    const token = gerarTokenDeReserva({ unidadeId: unidade.id, igSenderId: "ig-cliente-1" });

    const res = await request(app).get(`/public/reservation-link/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.unidadeNome).toBe(unidade.nome);
  });

  it("retorna 410 para token invalido (string qualquer)", async () => {
    const res = await request(app).get("/public/reservation-link/token-invalido-qualquer");
    expect(res.status).toBe(410);
  });

  it("retorna 410 para token de outro proposito (ex: nunca aceita um token de sessao de admin aqui)", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const tokenDeAdmin = jwt.sign({ sub: "usuario-1", empresaId: "empresa-1", papel: "owner" }, process.env.JWT_SECRET!, {
      expiresIn: "1h",
    });
    const res = await request(app).get(`/public/reservation-link/${tokenDeAdmin}`);
    expect(res.status).toBe(410);
  });
});

describe("POST /public/reservation-link/:token/reservations", () => {
  it("cria a reserva vinculada ao unidadeId/igSenderId do TOKEN, ignorando qualquer valor desses campos enviado no corpo", async () => {
    const { empresa, unidade } = await setupUnidadeCompleta();
    const token = gerarTokenDeReserva({ unidadeId: unidade.id, igSenderId: "ig-cliente-real" });
    void empresa;

    const res = await request(app)
      .post(`/public/reservation-link/${token}/reservations`)
      .send({
        data: "2026-11-20",
        horaInicio: "19:00",
        numPessoas: 2,
        clienteNome: "Cliente Publico",
        // tentativa de forjar isolamento - o schema nem declara esses campos, sao ignorados
        unidadeId: "00000000-0000-0000-0000-000000000000",
        igSenderId: "sender-forjado",
      });

    expect(res.status).toBe(201);

    const [linha] = await db.select().from(reservas).where(eq(reservas.id, res.body.id));
    expect(linha.unidadeId).toBe(unidade.id);
    expect(linha.igSenderId).toBe("ig-cliente-real");
    expect(linha.clienteNome).toBe("Cliente Publico");
    expect(linha.canalOrigem).toBe("instagram");
  });

  it("escolhe automaticamente uma mesa com capacidade compativel (modo simples, sem selecao manual)", async () => {
    const { unidade, salao } = await setupUnidadeCompleta();
    const mesaGrande = await criarMesa(salao.id, { nome: "Mesa Grande", capacidadeMin: 6, capacidadeMax: 10 });
    void mesaGrande;
    const token = gerarTokenDeReserva({ unidadeId: unidade.id, igSenderId: "ig-cliente-1" });

    const res = await request(app).post(`/public/reservation-link/${token}/reservations`).send({
      data: "2026-11-20",
      horaInicio: "19:00",
      numPessoas: 2,
      clienteNome: "Cliente Publico",
    });

    expect(res.status).toBe(201);
    const [linha] = await db.select().from(reservas).where(eq(reservas.id, res.body.id));
    // deve ter escolhido a mesa pequena (capacidade 1-4 do setup padrao), nao a grande
    expect(linha.numPessoas).toBe(2);
  });

  it("retorna erro (nao 201) quando nao ha mesa disponivel, e nao cria nenhuma reserva", async () => {
    const { unidade } = await setupUnidadeCompleta();
    const token = gerarTokenDeReserva({ unidadeId: unidade.id, igSenderId: "ig-cliente-1" });

    const res = await request(app).post(`/public/reservation-link/${token}/reservations`).send({
      data: "2026-11-20",
      horaInicio: "19:00",
      numPessoas: 50, // nenhuma mesa comporta
      clienteNome: "Grupo Grande",
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
    const todas = await db.select().from(reservas);
    expect(todas).toHaveLength(0);
  });

  it("rejeita token expirado/invalido tambem no POST", async () => {
    const res = await request(app).post("/public/reservation-link/token-invalido/reservations").send({
      data: "2026-11-20",
      horaInicio: "19:00",
      numPessoas: 2,
      clienteNome: "Cliente",
    });
    expect(res.status).toBe(410);
  });

  it("envia confirmacao pelo Instagram quando ha conexao e conversa associadas", async () => {
    const { empresa, unidade } = await setupUnidadeCompleta();
    await criarConexaoInstagram(empresa.id, unidade.id, "ig-conta-restaurante");
    await criarConversa(empresa.id, unidade.id, "ig-cliente-1");
    const token = gerarTokenDeReserva({ unidadeId: unidade.id, igSenderId: "ig-cliente-1" });

    const res = await request(app).post(`/public/reservation-link/${token}/reservations`).send({
      data: "2026-11-20",
      horaInicio: "19:00",
      numPessoas: 2,
      clienteNome: "Cliente Publico",
    });

    expect(res.status).toBe(201);
    expect(enviarMensagemInstagram).toHaveBeenCalledTimes(1);
    expect(vi.mocked(enviarMensagemInstagram).mock.calls[0][1]).toBe("ig-cliente-1");
  });

  it("cria a reserva normalmente mesmo sem conexao/conversa do Instagram (notificacao e best-effort)", async () => {
    const { unidade } = await setupUnidadeCompleta();
    const token = gerarTokenDeReserva({ unidadeId: unidade.id, igSenderId: "ig-sem-conexao" });

    const res = await request(app).post(`/public/reservation-link/${token}/reservations`).send({
      data: "2026-11-20",
      horaInicio: "19:00",
      numPessoas: 2,
      clienteNome: "Cliente Publico",
    });

    expect(res.status).toBe(201);
    expect(enviarMensagemInstagram).not.toHaveBeenCalled();
  });
});
