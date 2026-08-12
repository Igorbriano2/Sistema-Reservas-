import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import request from "supertest";
import { createApp } from "../src/app.js";
import { db } from "../src/db/client.js";
import { empresas, plataformaAdmins, reservas } from "../src/db/schema/index.js";
import { hashPassword } from "../src/lib/password.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
import { criarMesa, criarSalao } from "./helpers/fixtures.js";
import { login } from "./helpers/auth.js";

const app = createApp();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

async function criarPlataformaAdmin(email = "igor@queroreservar.com", senha = "senhaSuperSecreta123") {
  const senhaHash = await hashPassword(senha);
  const [admin] = await db.insert(plataformaAdmins).values({ nome: "Igor", email, senhaHash }).returning();
  return { admin, senha };
}

async function loginPlataforma(email: string, senha: string): Promise<string> {
  const res = await request(app).post("/plataforma/auth/login").send({ email, senha });
  if (res.status !== 200) {
    throw new Error(`Login de plataforma falhou: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.token as string;
}

describe("Autenticacao do painel da plataforma", () => {
  it("loga com credenciais corretas e devolve um token que funciona em /plataforma/auth/me", async () => {
    const { admin, senha } = await criarPlataformaAdmin();
    const token = await loginPlataforma(admin.email, senha);

    const me = await request(app).get("/plataforma/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(admin.email);
  });

  it("rejeita senha incorreta com mensagem generica", async () => {
    const { admin } = await criarPlataformaAdmin();
    const resposta = await request(app).post("/plataforma/auth/login").send({ email: admin.email, senha: "errada123" });
    expect(resposta.status).toBe(401);
  });

  it("um token de sessao normal (dono de restaurante) NAO funciona nas rotas de plataforma", async () => {
    const { usuario, senhaAdmin } = await criarEmpresaComAdmin();
    const tokenRestaurante = await login(app, usuario.email, senhaAdmin);
    const resposta = await request(app).get("/plataforma/clientes").set("Authorization", `Bearer ${tokenRestaurante}`);
    expect(resposta.status).toBe(401);
  });

  it("um token de plataforma NAO funciona nas rotas /admin de restaurante", async () => {
    const { admin, senha } = await criarPlataformaAdmin();
    const tokenPlataforma = await loginPlataforma(admin.email, senha);
    const resposta = await request(app).get("/admin/unidades").set("Authorization", `Bearer ${tokenPlataforma}`);
    expect(resposta.status).toBe(401);
  });
});

describe("Clientes (assinaturas)", () => {
  it("lista empresas reais com o contato do primeiro owner, sem incluir a empresa demo", async () => {
    const { admin, senha } = await criarPlataformaAdmin();
    const tokenPlataforma = await loginPlataforma(admin.email, senha);
    const { empresa } = await criarEmpresaComAdmin({ nomeEmpresa: "Espetaria Cervegela", emailAdmin: "dono@cervegela.com" });

    // garante uma empresa demo (via modo-teste) pra confirmar que ela NAO aparece na lista
    await request(app).post("/plataforma/modo-teste").set("Authorization", `Bearer ${tokenPlataforma}`);

    const lista = await request(app).get("/plataforma/clientes").set("Authorization", `Bearer ${tokenPlataforma}`);
    expect(lista.status).toBe(200);
    const nomes = lista.body.map((c: { nome: string }) => c.nome);
    expect(nomes).toContain("Espetaria Cervegela");
    expect(nomes).not.toContain("Restaurante Demo (modo teste)");

    const cliente = lista.body.find((c: { id: string }) => c.id === empresa.id);
    expect(cliente.contato).toMatchObject({ email: "dono@cervegela.com" });
    expect(cliente.assinaturaStatus).toBe("em_teste");
  });

  it("atualiza o status da assinatura e observacoes", async () => {
    const { admin, senha } = await criarPlataformaAdmin();
    const tokenPlataforma = await loginPlataforma(admin.email, senha);
    const { empresa } = await criarEmpresaComAdmin();

    const resposta = await request(app)
      .patch(`/plataforma/clientes/${empresa.id}`)
      .set("Authorization", `Bearer ${tokenPlataforma}`)
      .send({ assinaturaStatus: "ativo", observacoes: "Cliente pagante desde agosto" });

    expect(resposta.status).toBe(200);
    expect(resposta.body.assinaturaStatus).toBe("ativo");
    expect(resposta.body.observacoes).toBe("Cliente pagante desde agosto");
  });

  it("redefine a senha do dono (suporte: dono perdeu acesso, nao ha 'esqueci minha senha')", async () => {
    const { admin, senha } = await criarPlataformaAdmin();
    const tokenPlataforma = await loginPlataforma(admin.email, senha);
    const { empresa, usuario } = await criarEmpresaComAdmin({ emailAdmin: "antigo@cervegela.com" });

    const resposta = await request(app)
      .patch(`/plataforma/clientes/${empresa.id}/login-owner`)
      .set("Authorization", `Bearer ${tokenPlataforma}`)
      .send({ senha: "NovaSenha@123" });

    expect(resposta.status).toBe(200);
    expect(resposta.body.email).toBe("antigo@cervegela.com");

    const loginComSenhaNova = await login(app, usuario.email, "NovaSenha@123");
    expect(loginComSenhaNova).toBeTruthy();
  });

  it("editar login tambem pode trocar o e-mail, se informado junto com a senha", async () => {
    const { admin, senha } = await criarPlataformaAdmin();
    const tokenPlataforma = await loginPlataforma(admin.email, senha);
    const { empresa } = await criarEmpresaComAdmin({ emailAdmin: "antigo@cervegela.com" });

    const resposta = await request(app)
      .patch(`/plataforma/clientes/${empresa.id}/login-owner`)
      .set("Authorization", `Bearer ${tokenPlataforma}`)
      .send({ senha: "NovaSenha@123", email: "novo@cervegela.com" });

    expect(resposta.status).toBe(200);
    expect(resposta.body.email).toBe("novo@cervegela.com");

    const loginComEmailNovo = await login(app, "novo@cervegela.com", "NovaSenha@123");
    expect(loginComEmailNovo).toBeTruthy();
  });

  it("troca so o e-mail (ou so o nome), sem exigir senha nova (doc 36)", async () => {
    const { admin, senha } = await criarPlataformaAdmin();
    const tokenPlataforma = await loginPlataforma(admin.email, senha);
    const { empresa, senhaAdmin } = await criarEmpresaComAdmin({ emailAdmin: "antigo2@cervegela.com" });

    const resposta = await request(app)
      .patch(`/plataforma/clientes/${empresa.id}/login-owner`)
      .set("Authorization", `Bearer ${tokenPlataforma}`)
      .send({ nome: "Novo Nome do Dono", email: "novo2@cervegela.com" });

    expect(resposta.status).toBe(200);
    expect(resposta.body.nome).toBe("Novo Nome do Dono");
    expect(resposta.body.email).toBe("novo2@cervegela.com");

    // A senha antiga continua valendo - nao foi tocada.
    const loginComSenhaAntiga = await login(app, "novo2@cervegela.com", senhaAdmin);
    expect(loginComSenhaAntiga).toBeTruthy();
  });

  it("rejeita editar login sem nenhum campo", async () => {
    const { admin, senha } = await criarPlataformaAdmin();
    const tokenPlataforma = await loginPlataforma(admin.email, senha);
    const { empresa } = await criarEmpresaComAdmin();

    const resposta = await request(app)
      .patch(`/plataforma/clientes/${empresa.id}/login-owner`)
      .set("Authorization", `Bearer ${tokenPlataforma}`)
      .send({});

    expect(resposta.status).toBe(400);
  });

  it("404 ao editar login de uma empresa que nao existe", async () => {
    const { admin, senha } = await criarPlataformaAdmin();
    const tokenPlataforma = await loginPlataforma(admin.email, senha);

    const resposta = await request(app)
      .patch(`/plataforma/clientes/00000000-0000-0000-0000-000000000000/login-owner`)
      .set("Authorization", `Bearer ${tokenPlataforma}`)
      .send({ senha: "NovaSenha@123" });

    expect(resposta.status).toBe(404);
  });

  it("exclui a conta (empresa + tudo dela) definitivamente (doc 36)", async () => {
    const { admin, senha } = await criarPlataformaAdmin();
    const tokenPlataforma = await loginPlataforma(admin.email, senha);
    const { empresa } = await criarEmpresaComAdmin();

    const resposta = await request(app)
      .delete(`/plataforma/clientes/${empresa.id}`)
      .set("Authorization", `Bearer ${tokenPlataforma}`);

    expect(resposta.status).toBe(204);

    const lista = await request(app)
      .get("/plataforma/clientes")
      .set("Authorization", `Bearer ${tokenPlataforma}`);
    expect(lista.body.find((c: { id: string }) => c.id === empresa.id)).toBeUndefined();
  });

  it("exclui a conta mesmo com salao/mesa/reserva - o cascade nao esbarra no restrict de reservas.mesa_id/salao_id (doc 36)", async () => {
    const { admin, senha } = await criarPlataformaAdmin();
    const tokenPlataforma = await loginPlataforma(admin.email, senha);
    const { empresa, unidade } = await criarEmpresaComAdmin();
    const salao = await criarSalao(unidade.id);
    const mesa = await criarMesa(salao.id, { capacidadeMin: 1, capacidadeMax: 4 });
    await db.insert(reservas).values({
      unidadeId: unidade.id,
      mesaId: mesa.id,
      clienteNome: "Cliente Teste",
      numPessoas: 2,
      data: "2026-12-01",
      horaInicio: "19:00",
      horaFim: "21:00",
    });

    const resposta = await request(app)
      .delete(`/plataforma/clientes/${empresa.id}`)
      .set("Authorization", `Bearer ${tokenPlataforma}`);

    expect(resposta.status).toBe(204);
  });

  it("404 ao excluir uma empresa que nao existe", async () => {
    const { admin, senha } = await criarPlataformaAdmin();
    const tokenPlataforma = await loginPlataforma(admin.email, senha);

    const resposta = await request(app)
      .delete(`/plataforma/clientes/00000000-0000-0000-0000-000000000000`)
      .set("Authorization", `Bearer ${tokenPlataforma}`);

    expect(resposta.status).toBe(404);
  });
});

describe("Leads (lista de espera da landing)", () => {
  async function criarLead(overrides: Partial<{ nome: string; email: string }> = {}) {
    const resposta = await request(app)
      .post("/public/waitlist")
      .send({
        nome: overrides.nome ?? "Maria Dona",
        email: overrides.email ?? "maria@restaurante.com",
        whatsapp: "43988887777",
        nomeRestaurante: "Restaurante da Maria",
      });
    return resposta.body.id as string;
  }

  it("lista leads e permite atualizar o status", async () => {
    const { admin, senha } = await criarPlataformaAdmin();
    const tokenPlataforma = await loginPlataforma(admin.email, senha);
    const leadId = await criarLead();

    const lista = await request(app).get("/plataforma/leads").set("Authorization", `Bearer ${tokenPlataforma}`);
    expect(lista.status).toBe(200);
    expect(lista.body.find((l: { id: string }) => l.id === leadId).status).toBe("novo");

    const atualizado = await request(app)
      .patch(`/plataforma/leads/${leadId}`)
      .set("Authorization", `Bearer ${tokenPlataforma}`)
      .send({ status: "contatado" });
    expect(atualizado.status).toBe(200);
    expect(atualizado.body.status).toBe("contatado");
  });

  it("converte um lead em cliente: cria empresa+login, marca convertido, e o novo login funciona", async () => {
    const { admin, senha } = await criarPlataformaAdmin();
    const tokenPlataforma = await loginPlataforma(admin.email, senha);
    const leadId = await criarLead({ email: "novo-cliente@restaurante.com" });

    const conversao = await request(app)
      .post(`/plataforma/leads/${leadId}/converter`)
      .set("Authorization", `Bearer ${tokenPlataforma}`)
      .send({ senha: "senhaDoNovoCliente123" });

    expect(conversao.status).toBe(201);
    expect(conversao.body.empresa.nome).toBe("Restaurante da Maria");
    expect(conversao.body.lead.status).toBe("convertido");
    expect(conversao.body.lead.convertidoEmpresaId).toBe(conversao.body.empresa.id);

    // o login criado pra o dono do novo cliente funciona de verdade
    const loginNovoCliente = await request(app)
      .post("/auth/login")
      .send({ identificador: "novo-cliente@restaurante.com", senha: "senhaDoNovoCliente123" });
    expect(loginNovoCliente.status).toBe(200);
    expect(loginNovoCliente.body.usuario.papel).toBe("owner");
  });

  it("rejeita converter um lead que ja foi convertido", async () => {
    const { admin, senha } = await criarPlataformaAdmin();
    const tokenPlataforma = await loginPlataforma(admin.email, senha);
    const leadId = await criarLead({ email: "outro@restaurante.com" });

    await request(app)
      .post(`/plataforma/leads/${leadId}/converter`)
      .set("Authorization", `Bearer ${tokenPlataforma}`)
      .send({ senha: "senhaDoNovoCliente123" });

    const segundaTentativa = await request(app)
      .post(`/plataforma/leads/${leadId}/converter`)
      .set("Authorization", `Bearer ${tokenPlataforma}`)
      .send({ senha: "outraSenha12345" });
    expect(segundaTentativa.status).toBe(400);
  });
});

describe("Modo teste", () => {
  it("devolve um token de restaurante valido (funciona em /admin) pra uma empresa demo criada automaticamente", async () => {
    const { admin, senha } = await criarPlataformaAdmin();
    const tokenPlataforma = await loginPlataforma(admin.email, senha);

    const resposta = await request(app).post("/plataforma/modo-teste").set("Authorization", `Bearer ${tokenPlataforma}`);
    expect(resposta.status).toBe(200);
    expect(resposta.body.usuario.papel).toBe("owner");

    const tokenRestauranteDemo = resposta.body.token as string;
    const unidades = await request(app).get("/admin/unidades").set("Authorization", `Bearer ${tokenRestauranteDemo}`);
    expect(unidades.status).toBe(200);
    expect(unidades.body.length).toBeGreaterThan(0);
  });

  it("reaproveita a MESMA empresa demo em chamadas repetidas (nao duplica)", async () => {
    const { admin, senha } = await criarPlataformaAdmin();
    const tokenPlataforma = await loginPlataforma(admin.email, senha);

    const primeira = await request(app).post("/plataforma/modo-teste").set("Authorization", `Bearer ${tokenPlataforma}`);
    const segunda = await request(app).post("/plataforma/modo-teste").set("Authorization", `Bearer ${tokenPlataforma}`);

    expect(primeira.body.usuario.empresaId).toBe(segunda.body.usuario.empresaId);
    const demos = await db.select().from(empresas).where(eq(empresas.ehDemo, true));
    expect(demos).toHaveLength(1);
  });
});
