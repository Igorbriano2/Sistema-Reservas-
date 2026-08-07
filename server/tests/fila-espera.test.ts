import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
import { login } from "./helpers/auth.js";

vi.mock("../src/lib/whatsapp-scheduler.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/lib/whatsapp-scheduler.js")>();
  return { ...mod, conexaoAtivaDaEmpresa: vi.fn().mockResolvedValue(null) };
});

const { createApp } = await import("../src/app.js");

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

describe("Fila de espera de walk-in (doc 20)", () => {
  it("adiciona um cliente na fila com status inicial 'esperando'", async () => {
    const { unidade, token } = await setup();

    const resposta = await request(app)
      .post(`/admin/unidades/${unidade.id}/fila-espera`)
      .set("Authorization", `Bearer ${token}`)
      .send({ clienteNome: "Maria", clienteTelefone: "43988414050", numPessoas: 4 });

    expect(resposta.status).toBe(201);
    expect(resposta.body.clienteNome).toBe("Maria");
    expect(resposta.body.status).toBe("esperando");
    expect(resposta.body.chamadoEm).toBeNull();
    expect(resposta.body.finalizadoEm).toBeNull();
  });

  it("lista so entradas ativas (esperando/chamado) por padrao, e tudo com ?todos=true", async () => {
    const { unidade, token } = await setup();

    const a = await request(app)
      .post(`/admin/unidades/${unidade.id}/fila-espera`)
      .set("Authorization", `Bearer ${token}`)
      .send({ clienteNome: "Ana", numPessoas: 2 });
    const b = await request(app)
      .post(`/admin/unidades/${unidade.id}/fila-espera`)
      .set("Authorization", `Bearer ${token}`)
      .send({ clienteNome: "Bruno", numPessoas: 3 });

    await request(app)
      .patch(`/admin/unidades/${unidade.id}/fila-espera/${b.body.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "sentado" });

    const somenteAtivos = await request(app)
      .get(`/admin/unidades/${unidade.id}/fila-espera`)
      .set("Authorization", `Bearer ${token}`);
    expect(somenteAtivos.body).toHaveLength(1);
    expect(somenteAtivos.body[0].id).toBe(a.body.id);

    const todos = await request(app)
      .get(`/admin/unidades/${unidade.id}/fila-espera?todos=true`)
      .set("Authorization", `Bearer ${token}`);
    expect(todos.body).toHaveLength(2);
  });

  it("marca chamadoEm ao mudar pra 'chamado' e finalizadoEm ao sentar ou desistir", async () => {
    const { unidade, token } = await setup();

    const criado = await request(app)
      .post(`/admin/unidades/${unidade.id}/fila-espera`)
      .set("Authorization", `Bearer ${token}`)
      .send({ clienteNome: "Carla", numPessoas: 2 });

    const chamado = await request(app)
      .patch(`/admin/unidades/${unidade.id}/fila-espera/${criado.body.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "chamado" });
    expect(chamado.status).toBe(200);
    expect(chamado.body.status).toBe("chamado");
    expect(chamado.body.chamadoEm).not.toBeNull();
    expect(chamado.body.finalizadoEm).toBeNull();

    const sentado = await request(app)
      .patch(`/admin/unidades/${unidade.id}/fila-espera/${criado.body.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "sentado" });
    expect(sentado.body.status).toBe("sentado");
    expect(sentado.body.finalizadoEm).not.toBeNull();
  });

  it("exclui uma entrada da fila", async () => {
    const { unidade, token } = await setup();

    const criado = await request(app)
      .post(`/admin/unidades/${unidade.id}/fila-espera`)
      .set("Authorization", `Bearer ${token}`)
      .send({ clienteNome: "Daniela", numPessoas: 1 });

    const excluido = await request(app)
      .delete(`/admin/unidades/${unidade.id}/fila-espera/${criado.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(excluido.status).toBe(204);

    const listado = await request(app)
      .get(`/admin/unidades/${unidade.id}/fila-espera?todos=true`)
      .set("Authorization", `Bearer ${token}`);
    expect(listado.body).toHaveLength(0);
  });

  it("404 ao mudar status ou excluir entrada inexistente ou de outra unidade", async () => {
    const { unidade, token } = await setup();
    const outraEmpresa = await criarEmpresaComAdmin({ nomeEmpresa: "Outra Empresa Fila", emailAdmin: "outro-fila@teste.com" });
    const outroToken = await login(app, outraEmpresa.usuario.email, outraEmpresa.senhaAdmin);
    const criadoNaOutra = await request(app)
      .post(`/admin/unidades/${outraEmpresa.unidade.id}/fila-espera`)
      .set("Authorization", `Bearer ${outroToken}`)
      .send({ clienteNome: "Elias", numPessoas: 2 });

    const patch = await request(app)
      .patch(`/admin/unidades/${unidade.id}/fila-espera/${criadoNaOutra.body.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "chamado" });
    expect(patch.status).toBe(404);

    const del = await request(app)
      .delete(`/admin/unidades/${unidade.id}/fila-espera/${criadoNaOutra.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(404);
  });

  it("funcionario com acesso a unidade, mesmo sem nenhuma permissao extra, pode usar a fila de espera", async () => {
    const { unidade, token } = await setup();

    const funcionario = await request(app)
      .post("/admin/usuarios")
      .set("Authorization", `Bearer ${token}`)
      .send({
        nome: "Funcionario Fila",
        username: "func.fila.espera",
        senha: "senha12345",
        papel: "funcionario",
        unidadeIds: [unidade.id],
        permissoes: [],
      });
    expect(funcionario.status).toBe(201);
    const tokenFuncionario = await login(app, "func.fila.espera", "senha12345");

    const resposta = await request(app)
      .post(`/admin/unidades/${unidade.id}/fila-espera`)
      .set("Authorization", `Bearer ${tokenFuncionario}`)
      .send({ clienteNome: "Fabio", numPessoas: 2 });
    expect(resposta.status).toBe(201);
  });
});
