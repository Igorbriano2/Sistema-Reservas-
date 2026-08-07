import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { db } from "../src/db/client.js";
import { unidades } from "../src/db/schema/index.js";
import { closeDb, criarEmpresaComAdmin, criarFuncionario, criarUsuarioUnidade, truncateAll } from "./helpers/db.js";
import { criarSalao } from "./helpers/fixtures.js";
import { login } from "./helpers/auth.js";

const app = createApp();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

// permissoesExtraFuncionario: [] (padrao) cobre so a baseline (reservas do dia),
// continuando liberada mesmo quando tudo o resto (saloes/mesas/relatorios/etc)
// continua bloqueado por falta de permissao.
async function setup(permissoesExtraFuncionario: string[] = []) {
  const { empresa, unidade, usuario, senhaAdmin } = await criarEmpresaComAdmin();
  const tokenOwner = await login(app, usuario.email, senhaAdmin);
  const { usuario: funcionario, senha: senhaFuncionario } = await criarFuncionario(empresa.id);
  await criarUsuarioUnidade(funcionario.id, unidade.id, permissoesExtraFuncionario);
  const tokenFuncionario = await login(app, funcionario.username, senhaFuncionario);
  return { empresa, unidade, tokenOwner, tokenFuncionario, funcionario };
}

describe("Papeis - funcionario nao acessa recursos de configuracao (403), nem sabendo a URL exata", () => {
  it("bloqueia saloes", async () => {
    const { unidade, tokenFuncionario } = await setup();
    const get = await request(app).get(`/admin/unidades/${unidade.id}/saloes`).set("Authorization", `Bearer ${tokenFuncionario}`);
    expect(get.status).toBe(403);
    const post = await request(app)
      .post(`/admin/unidades/${unidade.id}/saloes`)
      .set("Authorization", `Bearer ${tokenFuncionario}`)
      .send({ nome: "Tentativa" });
    expect(post.status).toBe(403);
  });

  it("bloqueia mesas", async () => {
    const { unidade, tokenFuncionario } = await setup();
    const get = await request(app).get(`/admin/unidades/${unidade.id}/mesas`).set("Authorization", `Bearer ${tokenFuncionario}`);
    expect(get.status).toBe(403);
    const post = await request(app)
      .post(`/admin/unidades/${unidade.id}/mesas`)
      .set("Authorization", `Bearer ${tokenFuncionario}`)
      .send({ salaoId: "00000000-0000-0000-0000-000000000000", nome: "X", capacidadeMin: 1, capacidadeMax: 2 });
    expect(post.status).toBe(403);
  });

  it("bloqueia regras-horario", async () => {
    const { unidade, tokenFuncionario } = await setup();
    const res = await request(app)
      .get(`/admin/unidades/${unidade.id}/regras-horario`)
      .set("Authorization", `Bearer ${tokenFuncionario}`);
    expect(res.status).toBe(403);
  });

  it("bloqueia agente-config", async () => {
    const { tokenFuncionario } = await setup();
    const get = await request(app).get("/admin/agente-config").set("Authorization", `Bearer ${tokenFuncionario}`);
    expect(get.status).toBe(403);
    const patch = await request(app)
      .patch("/admin/agente-config")
      .set("Authorization", `Bearer ${tokenFuncionario}`)
      .send({ nomeDoAgente: "Hackeado" });
    expect(patch.status).toBe(403);
  });

  it("bloqueia criacao/listagem de usuarios", async () => {
    const { unidade, tokenFuncionario } = await setup();
    const get = await request(app).get("/admin/usuarios").set("Authorization", `Bearer ${tokenFuncionario}`);
    expect(get.status).toBe(403);
    const post = await request(app)
      .post("/admin/usuarios")
      .set("Authorization", `Bearer ${tokenFuncionario}`)
      .send({ nome: "Outro", username: "outro", senha: "12345678", papel: "funcionario", unidadeIds: [unidade.id] });
    expect(post.status).toBe(403);
  });

  it("bloqueia conversas", async () => {
    const { unidade, tokenFuncionario } = await setup();
    const res = await request(app).get(`/admin/unidades/${unidade.id}/conversas`).set("Authorization", `Bearer ${tokenFuncionario}`);
    expect(res.status).toBe(403);
  });
});

describe("Papeis - funcionario acessa reservas do dia e disponibilidade normalmente", () => {
  it("permite listar/criar/editar/cancelar reservas e checar disponibilidade", async () => {
    const { empresa, unidade, tokenOwner, tokenFuncionario } = await setup();
    void empresa;

    const salao = await criarSalao(unidade.id);
    const mesa = await request(app)
      .post(`/admin/unidades/${unidade.id}/mesas`)
      .set("Authorization", `Bearer ${tokenOwner}`)
      .send({ salaoId: salao.id, nome: "Mesa 1", capacidadeMin: 1, capacidadeMax: 4 });
    expect(mesa.status).toBe(201);

    const disponibilidade = await request(app)
      .get(`/admin/unidades/${unidade.id}/availability`)
      .set("Authorization", `Bearer ${tokenFuncionario}`)
      .query({ data: "2026-12-01", hora: "19:00", numPessoas: 2 });
    expect(disponibilidade.status).toBe(200);

    const criar = await request(app)
      .post(`/admin/unidades/${unidade.id}/reservations`)
      .set("Authorization", `Bearer ${tokenFuncionario}`)
      .send({ mesaId: mesa.body.id, data: "2026-12-01", horaInicio: "19:00", horaFim: "20:30", numPessoas: 2, clienteNome: "Cliente X" });
    expect(criar.status).toBe(201);

    const listar = await request(app)
      .get(`/admin/unidades/${unidade.id}/reservations`)
      .set("Authorization", `Bearer ${tokenFuncionario}`)
      .query({ data: "2026-12-01" });
    expect(listar.status).toBe(200);
    expect(listar.body).toHaveLength(1);

    const editar = await request(app)
      .patch(`/admin/unidades/${unidade.id}/reservations/${criar.body.id}`)
      .set("Authorization", `Bearer ${tokenFuncionario}`)
      .send({ numPessoas: 3 });
    expect(editar.status).toBe(200);

    const cancelar = await request(app)
      .delete(`/admin/unidades/${unidade.id}/reservations/${criar.body.id}`)
      .set("Authorization", `Bearer ${tokenFuncionario}`);
    expect(cancelar.status).toBe(200);
  });
});

describe("Doc 17 - permissoes extra desbloqueiam funcionalidades especificas por unidade", () => {
  it("editar_salao libera saloes, mas nao relatorios nem agente-config", async () => {
    const { unidade, tokenFuncionario } = await setup(["editar_salao"]);

    const saloes = await request(app).get(`/admin/unidades/${unidade.id}/saloes`).set("Authorization", `Bearer ${tokenFuncionario}`);
    expect(saloes.status).toBe(200);

    const relatorios = await request(app)
      .get(`/admin/unidades/${unidade.id}/relatorios`)
      .set("Authorization", `Bearer ${tokenFuncionario}`)
      .query({ dataInicio: "2026-09-14", dataFim: "2026-09-15" });
    expect(relatorios.status).toBe(403);

    const agenteConfig = await request(app).get("/admin/agente-config").set("Authorization", `Bearer ${tokenFuncionario}`);
    expect(agenteConfig.status).toBe(403);
  });

  it("ver_relatorios libera so relatorios", async () => {
    const { unidade, tokenFuncionario } = await setup(["ver_relatorios"]);

    const relatorios = await request(app)
      .get(`/admin/unidades/${unidade.id}/relatorios`)
      .set("Authorization", `Bearer ${tokenFuncionario}`)
      .query({ dataInicio: "2026-09-14", dataFim: "2026-09-15" });
    expect(relatorios.status).toBe(200);

    const saloes = await request(app).get(`/admin/unidades/${unidade.id}/saloes`).set("Authorization", `Bearer ${tokenFuncionario}`);
    expect(saloes.status).toBe(403);
  });

  it("editar_agente e criar_usuarios sao por empresa, nao por unidade (valem tendo a permissao em qualquer loja)", async () => {
    const { tokenFuncionario } = await setup(["editar_agente", "criar_usuarios"]);

    const agenteConfig = await request(app).get("/admin/agente-config").set("Authorization", `Bearer ${tokenFuncionario}`);
    expect(agenteConfig.status).toBe(200);

    const usuariosLista = await request(app).get("/admin/usuarios").set("Authorization", `Bearer ${tokenFuncionario}`);
    expect(usuariosLista.status).toBe(200);
  });

  it("criar_usuarios nao deixa um gerente/funcionario se auto-promover alem do proprio alcance", async () => {
    const { empresa, unidade, tokenFuncionario } = await setup(["criar_usuarios"]);
    const [outraUnidade] = await db.insert(unidades).values({ empresaId: empresa.id, nome: "Segunda Unidade" }).returning();

    // Nao pode conceder uma permissao que ele proprio nao tem (so tem criar_usuarios).
    const comPermissaoAlemDoAlcance = await request(app)
      .post("/admin/usuarios")
      .set("Authorization", `Bearer ${tokenFuncionario}`)
      .send({ nome: "X", username: "user.x1", senha: "12345678", papel: "funcionario", unidadeIds: [unidade.id], permissoes: ["editar_agente"] });
    expect(comPermissaoAlemDoAlcance.status).toBe(400);

    // Nao pode conceder acesso a uma unidade que ele proprio nao alcanca.
    const comUnidadeAlemDoAlcance = await request(app)
      .post("/admin/usuarios")
      .set("Authorization", `Bearer ${tokenFuncionario}`)
      .send({ nome: "X", username: "user.x2", senha: "12345678", papel: "funcionario", unidadeIds: [outraUnidade.id], permissoes: [] });
    expect(comUnidadeAlemDoAlcance.status).toBe(400);

    // Dentro do proprio alcance (mesma unidade, sem nenhuma permissao extra), funciona.
    const dentroDoAlcance = await request(app)
      .post("/admin/usuarios")
      .set("Authorization", `Bearer ${tokenFuncionario}`)
      .send({ nome: "X", username: "user.x3", senha: "12345678", papel: "funcionario", unidadeIds: [unidade.id], permissoes: [] });
    expect(dentroDoAlcance.status).toBe(201);
  });

  it("acesso a uma unidade nao da acesso a outra unidade da mesma empresa", async () => {
    const { empresa, unidade, tokenFuncionario } = await setup(["editar_salao"]);
    const [outraUnidade] = await db.insert(unidades).values({ empresaId: empresa.id, nome: "Segunda Unidade" }).returning();

    const naPropriaUnidade = await request(app)
      .get(`/admin/unidades/${unidade.id}/saloes`)
      .set("Authorization", `Bearer ${tokenFuncionario}`);
    expect(naPropriaUnidade.status).toBe(200);

    const naOutraUnidade = await request(app)
      .get(`/admin/unidades/${outraUnidade.id}/saloes`)
      .set("Authorization", `Bearer ${tokenFuncionario}`);
    expect(naOutraUnidade.status).toBe(403);
  });
});

describe("Papeis - owner tem acesso total", () => {
  it("owner acessa mesas, saloes, regras, agente-config e usuarios", async () => {
    const { unidade, tokenOwner } = await setup();

    expect((await request(app).get(`/admin/unidades/${unidade.id}/saloes`).set("Authorization", `Bearer ${tokenOwner}`)).status).toBe(200);
    expect((await request(app).get(`/admin/unidades/${unidade.id}/mesas`).set("Authorization", `Bearer ${tokenOwner}`)).status).toBe(200);
    expect(
      (await request(app).get(`/admin/unidades/${unidade.id}/regras-horario`).set("Authorization", `Bearer ${tokenOwner}`)).status,
    ).toBe(200);
    expect((await request(app).get("/admin/agente-config").set("Authorization", `Bearer ${tokenOwner}`)).status).toBe(200);
    expect((await request(app).get("/admin/usuarios").set("Authorization", `Bearer ${tokenOwner}`)).status).toBe(200);
  });

  it("owner cria um funcionario, que loga e so enxerga o proprio papel restrito", async () => {
    const { unidade, tokenOwner } = await setup();

    const criar = await request(app)
      .post("/admin/usuarios")
      .set("Authorization", `Bearer ${tokenOwner}`)
      .send({ nome: "Novo Funcionario", username: "novo.funcionario", senha: "senha-valida-123", papel: "funcionario", unidadeIds: [unidade.id] });
    expect(criar.status).toBe(201);
    expect(criar.body.papel).toBe("funcionario");
    expect(criar.body.senhaHash).toBeUndefined();

    const loginNovo = await request(app).post("/auth/login").send({ identificador: "novo.funcionario", senha: "senha-valida-123" });
    expect(loginNovo.status).toBe(200);
    expect(loginNovo.body.usuario.papel).toBe("funcionario");
  });

  it("rejeita criar usuario com username duplicado com mensagem clara", async () => {
    const { unidade, tokenOwner, funcionario } = await setup();
    const res = await request(app)
      .post("/admin/usuarios")
      .set("Authorization", `Bearer ${tokenOwner}`)
      .send({ nome: "Duplicado", username: funcionario.username, senha: "senha-valida-123", papel: "funcionario", unidadeIds: [unidade.id] });
    expect(res.status).toBe(400);
  });
});

describe("GET/PATCH /admin/agente-config", () => {
  it("cria configuracao padrao no primeiro GET e permite atualizar", async () => {
    const { tokenOwner } = await setup();

    const get = await request(app).get("/admin/agente-config").set("Authorization", `Bearer ${tokenOwner}`);
    expect(get.status).toBe(200);
    expect(get.body.nomeDoAgente).toBeTruthy();

    const patch = await request(app)
      .patch("/admin/agente-config")
      .set("Authorization", `Bearer ${tokenOwner}`)
      .send({ nomeDoAgente: "Bia", topicosProibidos: ["politica"] });
    expect(patch.status).toBe(200);
    expect(patch.body.nomeDoAgente).toBe("Bia");
    expect(patch.body.topicosProibidos).toEqual(["politica"]);
  });
});
