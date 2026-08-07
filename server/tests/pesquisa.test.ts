import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import request from "supertest";
import { db } from "../src/db/client.js";
import { feedbacks, pesquisaPerguntas, pesquisaRespostas } from "../src/db/schema/index.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
import { login } from "./helpers/auth.js";
import { criarCliente, criarConexaoWhatsapp, criarMesa, criarReservaDireta, criarSalao } from "./helpers/fixtures.js";

vi.mock("../src/lib/whatsapp-api.js", () => ({
  enviarTemplateWhatsapp: vi.fn().mockResolvedValue("wamid.teste"),
  verificarAssinaturaDoWebhookWhatsapp: vi.fn(() => true),
}));

const { enviarTemplateWhatsapp } = await import("../src/lib/whatsapp-api.js");
const { executarRotinaFeedback } = await import("../src/lib/whatsapp-scheduler.js");
const { createApp } = await import("../src/app.js");
const { gerarTokenDePesquisa } = await import("../src/lib/pesquisa-link.js");

const app = createApp();

beforeEach(async () => {
  await truncateAll();
  vi.mocked(enviarTemplateWhatsapp).mockClear().mockResolvedValue("wamid.teste");
});

afterAll(async () => {
  await closeDb();
});

async function setup() {
  const empresa = await criarEmpresaComAdmin();
  const token = await login(app, empresa.usuario.email, empresa.senhaAdmin);
  return { ...empresa, token };
}

describe("CRUD de perguntas de NPS customizavel (doc 21)", () => {
  it("owner cria, lista, atualiza e exclui uma pergunta", async () => {
    const { token } = await setup();

    const criada = await request(app)
      .post("/admin/pesquisa-perguntas")
      .set("Authorization", `Bearer ${token}`)
      .send({ tipo: "escala", texto: "De 1 a 5, como foi sua experiencia?" });
    expect(criada.status).toBe(201);
    expect(criada.body.tipo).toBe("escala");
    expect(criada.body.ativa).toBe(true);

    const listada = await request(app).get("/admin/pesquisa-perguntas").set("Authorization", `Bearer ${token}`);
    expect(listada.body).toHaveLength(1);

    const atualizada = await request(app)
      .patch(`/admin/pesquisa-perguntas/${criada.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ texto: "Nota atualizada", ativa: false });
    expect(atualizada.status).toBe(200);
    expect(atualizada.body.texto).toBe("Nota atualizada");
    expect(atualizada.body.ativa).toBe(false);

    const excluida = await request(app).delete(`/admin/pesquisa-perguntas/${criada.body.id}`).set("Authorization", `Bearer ${token}`);
    expect(excluida.status).toBe(204);
  });

  it("gerente/funcionario nao pode gerenciar perguntas (owner-only)", async () => {
    const { unidade, token } = await setup();
    const funcionario = await request(app)
      .post("/admin/usuarios")
      .set("Authorization", `Bearer ${token}`)
      .send({
        nome: "Funcionario",
        username: "func.pesquisa",
        senha: "senha12345",
        papel: "funcionario",
        unidadeIds: [unidade.id],
        permissoes: [],
      });
    const tokenFuncionario = await login(app, "func.pesquisa", "senha12345");

    const resposta = await request(app)
      .post("/admin/pesquisa-perguntas")
      .set("Authorization", `Bearer ${tokenFuncionario}`)
      .send({ tipo: "texto_curto", texto: "O que podemos melhorar?" });
    expect(resposta.status).toBe(403);
    expect(funcionario.status).toBe(201);
  });
});

describe("GET/POST /public/pesquisa/:token (pagina publica da pesquisa)", () => {
  async function setupComPergunta() {
    const { empresa, unidade } = await criarEmpresaComAdmin();
    const salao = await criarSalao(unidade.id);
    const mesa = await criarMesa(salao.id, { capacidadeMin: 1, capacidadeMax: 4 });
    const reserva = await criarReservaDireta(unidade.id, mesa.id, "ig-1");
    const [pergunta] = await db
      .insert(pesquisaPerguntas)
      .values({ empresaId: empresa.id, tipo: "escala", texto: "Nota geral" })
      .returning();
    return { empresa, unidade, reserva, pergunta };
  }

  it("mostra as perguntas ativas da empresa pro token valido", async () => {
    const { empresa, unidade, reserva } = await setupComPergunta();
    const token = gerarTokenDePesquisa({ empresaId: empresa.id, reservaId: reserva.id, clienteTelefone: "11911112222" });

    const resposta = await request(app).get(`/public/pesquisa/${token}`);
    expect(resposta.status).toBe(200);
    expect(resposta.body.unidadeNome).toBe(unidade.nome);
    expect(resposta.body.jaRespondida).toBe(false);
    expect(resposta.body.perguntas).toHaveLength(1);
  });

  it("410 pra token invalido", async () => {
    const resposta = await request(app).get("/public/pesquisa/token-invalido");
    expect(resposta.status).toBe(410);
  });

  it("registra a resposta e cria a linha em feedbacks vinculada a reserva", async () => {
    const { empresa, reserva, pergunta } = await setupComPergunta();
    const token = gerarTokenDePesquisa({ empresaId: empresa.id, reservaId: reserva.id, clienteTelefone: "11911112222" });

    const resposta = await request(app)
      .post(`/public/pesquisa/${token}`)
      .send({ respostas: [{ perguntaId: pergunta.id, valorEscala: 5 }] });
    expect(resposta.status).toBe(201);

    const [feedback] = await db.select().from(feedbacks).where(eq(feedbacks.reservaId, reserva.id));
    expect(feedback).toBeDefined();
    expect(feedback.clienteTelefone).toBe("11911112222");

    const respostasSalvas = await db.select().from(pesquisaRespostas).where(eq(pesquisaRespostas.feedbackId, feedback.id));
    expect(respostasSalvas).toHaveLength(1);
    expect(respostasSalvas[0].valorEscala).toBe(5);
  });

  it("rejeita responder de novo depois de ja ter respondido", async () => {
    const { empresa, reserva, pergunta } = await setupComPergunta();
    const token = gerarTokenDePesquisa({ empresaId: empresa.id, reservaId: reserva.id, clienteTelefone: "11911112222" });

    await request(app)
      .post(`/public/pesquisa/${token}`)
      .send({ respostas: [{ perguntaId: pergunta.id, valorEscala: 4 }] });

    const segunda = await request(app)
      .post(`/public/pesquisa/${token}`)
      .send({ respostas: [{ perguntaId: pergunta.id, valorEscala: 2 }] });
    expect(segunda.status).toBe(400);

    const todasRespostas = await db.select().from(pesquisaRespostas);
    expect(todasRespostas).toHaveLength(1);
  });

  it("rejeita perguntaId de outra empresa", async () => {
    const { empresa, reserva } = await setupComPergunta();
    const outraEmpresa = await criarEmpresaComAdmin({ nomeEmpresa: "Outra Empresa Pesquisa", emailAdmin: "outro-pesquisa@teste.com" });
    const [perguntaDeOutraEmpresa] = await db
      .insert(pesquisaPerguntas)
      .values({ empresaId: outraEmpresa.empresa.id, tipo: "escala", texto: "Pergunta de outra empresa" })
      .returning();

    const token = gerarTokenDePesquisa({ empresaId: empresa.id, reservaId: reserva.id, clienteTelefone: "11911112222" });
    const resposta = await request(app)
      .post(`/public/pesquisa/${token}`)
      .send({ respostas: [{ perguntaId: perguntaDeOutraEmpresa.id, valorEscala: 3 }] });
    expect(resposta.status).toBe(400);
  });
});

describe("Rotina de feedback envia o link da pesquisa quando ha perguntas customizadas (doc 21)", () => {
  async function setupBase() {
    const { empresa, unidade } = await criarEmpresaComAdmin();
    const salao = await criarSalao(unidade.id);
    const mesa = await criarMesa(salao.id, { capacidadeMin: 1, capacidadeMax: 4 });
    await criarConexaoWhatsapp(empresa.id, null);
    return { empresa, unidade, salao, mesa };
  }

  function dataOffset(offsetDias: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offsetDias);
    return d.toISOString().slice(0, 10);
  }

  it("inclui a variavel de link no template quando a empresa tem pergunta ativa", async () => {
    const { empresa, unidade, mesa } = await setupBase();
    await criarCliente(empresa.id, "11911112222", { whatsappOptIn: true });
    await criarReservaDireta(unidade.id, mesa.id, "ig-1", { data: dataOffset(-1) });
    await db.execute(sql`UPDATE reservas SET status = 'concluida', cliente_telefone = '11911112222' WHERE unidade_id = ${unidade.id}`);
    await db.insert(pesquisaPerguntas).values({ empresaId: empresa.id, tipo: "escala", texto: "Nota geral" });

    await executarRotinaFeedback(db);

    expect(enviarTemplateWhatsapp).toHaveBeenCalledTimes(1);
    const chamada = vi.mocked(enviarTemplateWhatsapp).mock.calls[0][0];
    expect(chamada.componentes).toBeDefined();
    expect(chamada.componentes![0].parameters[0].text).toContain("/pesquisa/");
  });

  it("NAO inclui componentes quando a empresa nao tem pergunta customizada", async () => {
    const { empresa, unidade, mesa } = await setupBase();
    await criarCliente(empresa.id, "11922223333", { whatsappOptIn: true });
    await criarReservaDireta(unidade.id, mesa.id, "ig-2", { data: dataOffset(-1) });
    await db.execute(sql`UPDATE reservas SET status = 'concluida', cliente_telefone = '11922223333' WHERE unidade_id = ${unidade.id}`);

    await executarRotinaFeedback(db);

    expect(enviarTemplateWhatsapp).toHaveBeenCalledTimes(1);
    const chamada = vi.mocked(enviarTemplateWhatsapp).mock.calls[0][0];
    expect(chamada.componentes).toBeUndefined();
  });
});

describe("GET /admin/whatsapp/feedbacks inclui respostas customizadas (doc 21)", () => {
  it("agrupa respostas customizadas por feedback", async () => {
    const { empresa, unidade, token } = await setup();
    const salao = await criarSalao(unidade.id);
    const mesa = await criarMesa(salao.id, { capacidadeMin: 1, capacidadeMax: 4 });
    const reserva = await criarReservaDireta(unidade.id, mesa.id, "ig-1");
    const [pergunta] = await db
      .insert(pesquisaPerguntas)
      .values({ empresaId: empresa.id, tipo: "escala", texto: "Nota geral" })
      .returning();

    const tokenPesquisa = gerarTokenDePesquisa({ empresaId: empresa.id, reservaId: reserva.id, clienteTelefone: "11911112222" });
    await request(app)
      .post(`/public/pesquisa/${tokenPesquisa}`)
      .send({ respostas: [{ perguntaId: pergunta.id, valorEscala: 5 }] });

    const resposta = await request(app).get("/admin/whatsapp/feedbacks").set("Authorization", `Bearer ${token}`);
    expect(resposta.status).toBe(200);
    expect(resposta.body).toHaveLength(1);
    expect(resposta.body[0].respostasCustomizadas).toHaveLength(1);
    expect(resposta.body[0].respostasCustomizadas[0].perguntaTexto).toBe("Nota geral");
    expect(resposta.body[0].respostasCustomizadas[0].valorEscala).toBe(5);
  });
});
