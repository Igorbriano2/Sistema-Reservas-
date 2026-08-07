import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
import { login } from "./helpers/auth.js";

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

describe("CRUD de cardapio digital (categorias e itens)", () => {
  it("cria categoria e item, e lista categorias com itens aninhados", async () => {
    const { unidade, token } = await setup();

    const categoria = await request(app)
      .post(`/admin/unidades/${unidade.id}/cardapio/categorias`)
      .set("Authorization", `Bearer ${token}`)
      .send({ nome: "Entradas" });
    expect(categoria.status).toBe(201);
    expect(categoria.body.nome).toBe("Entradas");
    expect(categoria.body.ativo).toBe(true);

    const item = await request(app)
      .post(`/admin/unidades/${unidade.id}/cardapio/itens`)
      .set("Authorization", `Bearer ${token}`)
      .send({ categoriaId: categoria.body.id, nome: "Bruschetta", precoCentavos: 2500, porcaoServePessoas: 2 });
    expect(item.status).toBe(201);
    expect(item.body.nome).toBe("Bruschetta");
    expect(item.body.precoCentavos).toBe(2500);
    expect(item.body.somenteMaiorIdade).toBe(false);

    const listado = await request(app)
      .get(`/admin/unidades/${unidade.id}/cardapio`)
      .set("Authorization", `Bearer ${token}`);
    expect(listado.status).toBe(200);
    expect(listado.body).toHaveLength(1);
    expect(listado.body[0].itens).toHaveLength(1);
    expect(listado.body[0].itens[0].nome).toBe("Bruschetta");
  });

  it("atualiza e exclui categoria", async () => {
    const { unidade, token } = await setup();

    const categoria = await request(app)
      .post(`/admin/unidades/${unidade.id}/cardapio/categorias`)
      .set("Authorization", `Bearer ${token}`)
      .send({ nome: "Bebidas" });

    const atualizada = await request(app)
      .patch(`/admin/unidades/${unidade.id}/cardapio/categorias/${categoria.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ nome: "Drinks", ativo: false });
    expect(atualizada.status).toBe(200);
    expect(atualizada.body.nome).toBe("Drinks");
    expect(atualizada.body.ativo).toBe(false);

    const excluida = await request(app)
      .delete(`/admin/unidades/${unidade.id}/cardapio/categorias/${categoria.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(excluida.status).toBe(204);

    const listado = await request(app)
      .get(`/admin/unidades/${unidade.id}/cardapio`)
      .set("Authorization", `Bearer ${token}`);
    expect(listado.body).toHaveLength(0);
  });

  it("atualiza e exclui item", async () => {
    const { unidade, token } = await setup();

    const categoria = await request(app)
      .post(`/admin/unidades/${unidade.id}/cardapio/categorias`)
      .set("Authorization", `Bearer ${token}`)
      .send({ nome: "Pratos" });
    const item = await request(app)
      .post(`/admin/unidades/${unidade.id}/cardapio/itens`)
      .set("Authorization", `Bearer ${token}`)
      .send({ categoriaId: categoria.body.id, nome: "Vinho", precoCentavos: 5000, somenteMaiorIdade: true });

    const atualizado = await request(app)
      .patch(`/admin/unidades/${unidade.id}/cardapio/itens/${item.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ precoCentavos: 5500, tags: ["destaque"] });
    expect(atualizado.status).toBe(200);
    expect(atualizado.body.precoCentavos).toBe(5500);
    expect(atualizado.body.tags).toEqual(["destaque"]);

    const excluido = await request(app)
      .delete(`/admin/unidades/${unidade.id}/cardapio/itens/${item.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(excluido.status).toBe(204);
  });

  it("rejeita categoria de outra unidade ao criar item", async () => {
    const { unidade, token } = await setup();
    const outraEmpresa = await criarEmpresaComAdmin({ nomeEmpresa: "Outra Empresa", emailAdmin: "outro-cardapio@teste.com" });
    const outroToken = await login(app, outraEmpresa.usuario.email, outraEmpresa.senhaAdmin);
    const categoriaDaOutraUnidade = await request(app)
      .post(`/admin/unidades/${outraEmpresa.unidade.id}/cardapio/categorias`)
      .set("Authorization", `Bearer ${outroToken}`)
      .send({ nome: "Categoria de outra empresa" });

    const resposta = await request(app)
      .post(`/admin/unidades/${unidade.id}/cardapio/itens`)
      .set("Authorization", `Bearer ${token}`)
      .send({ categoriaId: categoriaDaOutraUnidade.body.id, nome: "Item invasor", precoCentavos: 1000 });
    expect(resposta.status).toBe(400);
  });

  it("404 ao atualizar/excluir categoria ou item inexistente", async () => {
    const { unidade, token } = await setup();
    const idFalso = "00000000-0000-0000-0000-000000000000";

    const patchCategoria = await request(app)
      .patch(`/admin/unidades/${unidade.id}/cardapio/categorias/${idFalso}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ nome: "Novo nome" });
    expect(patchCategoria.status).toBe(404);

    const delCategoria = await request(app)
      .delete(`/admin/unidades/${unidade.id}/cardapio/categorias/${idFalso}`)
      .set("Authorization", `Bearer ${token}`);
    expect(delCategoria.status).toBe(404);

    const patchItem = await request(app)
      .patch(`/admin/unidades/${unidade.id}/cardapio/itens/${idFalso}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ nome: "Novo nome" });
    expect(patchItem.status).toBe(404);

    const delItem = await request(app)
      .delete(`/admin/unidades/${unidade.id}/cardapio/itens/${idFalso}`)
      .set("Authorization", `Bearer ${token}`);
    expect(delItem.status).toBe(404);
  });

  it("bloqueia acesso sem a permissao editar_cardapio para funcionario", async () => {
    const { unidade, token } = await setup();

    const funcionario = await request(app)
      .post("/admin/usuarios")
      .set("Authorization", `Bearer ${token}`)
      .send({
        nome: "Funcionario Sem Permissao",
        username: "func.sem.cardapio",
        senha: "senha12345",
        papel: "funcionario",
        unidadeIds: [unidade.id],
        permissoes: [],
      });
    expect(funcionario.status).toBe(201);

    const tokenFuncionario = await login(app, "func.sem.cardapio", "senha12345");

    const resposta = await request(app)
      .get(`/admin/unidades/${unidade.id}/cardapio`)
      .set("Authorization", `Bearer ${tokenFuncionario}`);
    expect(resposta.status).toBe(403);
  });
});

describe("GET /public/cardapio/:unidadeId (pagina publica, QR code na mesa)", () => {
  it("mostra so categorias e itens ativos, ordenados por 'ordem'", async () => {
    const { unidade, token } = await setup();

    const catBebidas = await request(app)
      .post(`/admin/unidades/${unidade.id}/cardapio/categorias`)
      .set("Authorization", `Bearer ${token}`)
      .send({ nome: "Bebidas", ordem: 1 });
    const catEntradas = await request(app)
      .post(`/admin/unidades/${unidade.id}/cardapio/categorias`)
      .set("Authorization", `Bearer ${token}`)
      .send({ nome: "Entradas", ordem: 0 });
    const catDesativada = await request(app)
      .post(`/admin/unidades/${unidade.id}/cardapio/categorias`)
      .set("Authorization", `Bearer ${token}`)
      .send({ nome: "Fora do ar", ordem: 2, ativo: false });

    await request(app)
      .post(`/admin/unidades/${unidade.id}/cardapio/itens`)
      .set("Authorization", `Bearer ${token}`)
      .send({ categoriaId: catEntradas.body.id, nome: "Bruschetta", precoCentavos: 2500, ordem: 0 });
    await request(app)
      .post(`/admin/unidades/${unidade.id}/cardapio/itens`)
      .set("Authorization", `Bearer ${token}`)
      .send({ categoriaId: catEntradas.body.id, nome: "Item desativado", precoCentavos: 1000, ativo: false });
    await request(app)
      .post(`/admin/unidades/${unidade.id}/cardapio/itens`)
      .set("Authorization", `Bearer ${token}`)
      .send({ categoriaId: catBebidas.body.id, nome: "Suco", precoCentavos: 900 });
    await request(app)
      .post(`/admin/unidades/${unidade.id}/cardapio/itens`)
      .set("Authorization", `Bearer ${token}`)
      .send({ categoriaId: catDesativada.body.id, nome: "Item de categoria desativada", precoCentavos: 500 });

    const resposta = await request(app).get(`/public/cardapio/${unidade.id}`);
    expect(resposta.status).toBe(200);
    expect(resposta.body.unidadeNome).toBeTruthy();
    expect(resposta.body.categorias).toHaveLength(2);
    expect(resposta.body.categorias[0].nome).toBe("Entradas");
    expect(resposta.body.categorias[0].itens).toHaveLength(1);
    expect(resposta.body.categorias[0].itens[0].nome).toBe("Bruschetta");
    expect(resposta.body.categorias[1].nome).toBe("Bebidas");
    expect(resposta.body.categorias[1].itens[0].nome).toBe("Suco");
  });

  it("404 para unidade inexistente", async () => {
    const idFalso = "00000000-0000-0000-0000-000000000000";
    const resposta = await request(app).get(`/public/cardapio/${idFalso}`);
    expect(resposta.status).toBe(404);
  });

  it("nao mistura itens de outra unidade", async () => {
    const { unidade, token } = await setup();
    const outraEmpresa = await criarEmpresaComAdmin({ nomeEmpresa: "Outra Empresa Cardapio", emailAdmin: "outro-cardapio-publico@teste.com" });
    const outroToken = await login(app, outraEmpresa.usuario.email, outraEmpresa.senhaAdmin);
    const catOutra = await request(app)
      .post(`/admin/unidades/${outraEmpresa.unidade.id}/cardapio/categorias`)
      .set("Authorization", `Bearer ${outroToken}`)
      .send({ nome: "Categoria de outra empresa" });
    await request(app)
      .post(`/admin/unidades/${outraEmpresa.unidade.id}/cardapio/itens`)
      .set("Authorization", `Bearer ${outroToken}`)
      .send({ categoriaId: catOutra.body.id, nome: "Item de outra empresa", precoCentavos: 1000 });

    const cat = await request(app)
      .post(`/admin/unidades/${unidade.id}/cardapio/categorias`)
      .set("Authorization", `Bearer ${token}`)
      .send({ nome: "Entradas" });
    await request(app)
      .post(`/admin/unidades/${unidade.id}/cardapio/itens`)
      .set("Authorization", `Bearer ${token}`)
      .send({ categoriaId: cat.body.id, nome: "Bruschetta", precoCentavos: 2500 });

    const resposta = await request(app).get(`/public/cardapio/${unidade.id}`);
    expect(resposta.status).toBe(200);
    expect(resposta.body.categorias).toHaveLength(1);
    expect(resposta.body.categorias[0].itens).toHaveLength(1);
    expect(resposta.body.categorias[0].itens[0].nome).toBe("Bruschetta");
  });
});
