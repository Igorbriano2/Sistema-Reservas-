import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { criarEmpresaComAdmin, criarFuncionario, criarUsuarioUnidade, closeDb, truncateAll } from "./helpers/db.js";
import { login } from "./helpers/auth.js";

const app = createApp();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

async function setup() {
  const { empresa, unidade, usuario, senhaAdmin } = await criarEmpresaComAdmin();
  const tokenOwner = await login(app, usuario.email, senhaAdmin);
  return { empresa, unidade, tokenOwner };
}

describe("PATCH /admin/usuarios/:usuarioId - escalonamento de privilegio (achado da revisao de seguranca)", () => {
  it("nao permite que um funcionario com 'criar_usuarios' troque a SENHA de um colega com mais acesso, mesmo sem enviar unidadeIds/permissoes", async () => {
    const { empresa, unidade } = await setup();

    // Atacante: so tem "criar_usuarios" na unidade - nenhuma outra permissao.
    const { usuario: atacante, senha: senhaAtacante } = await criarFuncionario(empresa.id, "atacante");
    await criarUsuarioUnidade(atacante.id, unidade.id, ["criar_usuarios"]);
    const tokenAtacante = await login(app, atacante.username, senhaAtacante);

    // Vitima: gerente com bem mais alcance que o atacante na mesma unidade.
    const { usuario: vitima, senha: senhaVitimaOriginal } = await criarFuncionario(empresa.id, "vitima");
    await criarUsuarioUnidade(vitima.id, unidade.id, ["editar_agente", "ver_relatorios", "editar_cardapio"]);

    const res = await request(app)
      .patch(`/admin/usuarios/${vitima.id}`)
      .set("Authorization", `Bearer ${tokenAtacante}`)
      .send({ senha: "senhaDoAtacante123" });

    expect(res.status).toBe(400);

    // A senha original da vitima continua valida - a troca nao foi aplicada.
    const loginVitima = await login(app, vitima.username, senhaVitimaOriginal);
    expect(loginVitima).toBeTruthy();
    // A senha do atacante NAO deve funcionar para a vitima.
    const tentativaComSenhaAtacante = await request(app)
      .post("/auth/login")
      .send({ identificador: vitima.username, senha: "senhaDoAtacante123" });
    expect(tentativaComSenhaAtacante.status).toBe(401);
  });

  it("nao permite que um funcionario conceda a si mesmo (ou a outro) permissoes alem do proprio alcance so enviando 'permissoes' sem 'unidadeIds'", async () => {
    const { empresa, unidade, tokenOwner } = await setup();
    void tokenOwner;

    const { usuario: atacante, senha: senhaAtacante } = await criarFuncionario(empresa.id, "atacante2");
    await criarUsuarioUnidade(atacante.id, unidade.id, ["criar_usuarios"]);
    const tokenAtacante = await login(app, atacante.username, senhaAtacante);

    const res = await request(app)
      .patch(`/admin/usuarios/${atacante.id}`)
      .set("Authorization", `Bearer ${tokenAtacante}`)
      .send({ permissoes: ["editar_salao", "editar_agente", "ver_relatorios", "editar_cardapio", "criar_usuarios"] });

    expect(res.status).toBe(400);
  });

  it("owner consegue editar nome/senha de um funcionario livremente", async () => {
    const { empresa, unidade, tokenOwner } = await setup();
    const { usuario: funcionario } = await criarFuncionario(empresa.id, "func.editavel");
    await criarUsuarioUnidade(funcionario.id, unidade.id, []);

    const res = await request(app)
      .patch(`/admin/usuarios/${funcionario.id}`)
      .set("Authorization", `Bearer ${tokenOwner}`)
      .send({ nome: "Novo Nome", senha: "novaSenhaValida123" });

    expect(res.status).toBe(200);
    expect(res.body.nome).toBe("Novo Nome");

    const novoLogin = await login(app, funcionario.username, "novaSenhaValida123");
    expect(novoLogin).toBeTruthy();
  });

  it("um gerente com alcance igual ou maior que o alvo consegue editar normalmente (nao regride o caso legitimo)", async () => {
    const { empresa, unidade } = await setup();

    const { usuario: gerente, senha: senhaGerente } = await criarFuncionario(empresa.id, "gerente.amplo");
    await criarUsuarioUnidade(gerente.id, unidade.id, ["criar_usuarios", "editar_agente", "ver_relatorios"]);
    const tokenGerente = await login(app, gerente.username, senhaGerente);

    const { usuario: subordinado } = await criarFuncionario(empresa.id, "subordinado");
    await criarUsuarioUnidade(subordinado.id, unidade.id, ["ver_relatorios"]);

    const res = await request(app)
      .patch(`/admin/usuarios/${subordinado.id}`)
      .set("Authorization", `Bearer ${tokenGerente}`)
      .send({ nome: "Subordinado Renomeado" });

    expect(res.status).toBe(200);
    expect(res.body.nome).toBe("Subordinado Renomeado");
  });
});

describe("DELETE /admin/usuarios/:usuarioId", () => {
  it("owner exclui um funcionario normalmente", async () => {
    const { empresa, tokenOwner, unidade } = await setup();
    const { usuario: funcionario } = await criarFuncionario(empresa.id, "func.excluir");
    await criarUsuarioUnidade(funcionario.id, unidade.id, []);

    const res = await request(app).delete(`/admin/usuarios/${funcionario.id}`).set("Authorization", `Bearer ${tokenOwner}`);
    expect(res.status).toBe(204);
  });

  it("nao permite auto-exclusao", async () => {
    const { empresa, unidade } = await setup();
    const { usuario: funcionario, senha } = await criarFuncionario(empresa.id, "func.self");
    await criarUsuarioUnidade(funcionario.id, unidade.id, ["criar_usuarios"]);
    const token = await login(app, funcionario.username, senha);

    const res = await request(app).delete(`/admin/usuarios/${funcionario.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});
