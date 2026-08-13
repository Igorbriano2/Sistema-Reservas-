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

  it("aceita o slug legivel da unidade (link publico novo), alem do uuid legado", async () => {
    const { unidade } = await setup();

    const porSlug = await request(app).get(`/public/cardapio/${unidade.slug}`);
    expect(porSlug.status).toBe(200);
    expect(porSlug.body.unidadeNome).toBeTruthy();

    const porUuid = await request(app).get(`/public/cardapio/${unidade.id}`);
    expect(porUuid.status).toBe(200);
    expect(porUuid.body.unidadeNome).toBe(porSlug.body.unidadeNome);
  });

  it("404 para um slug inexistente", async () => {
    const resposta = await request(app).get(`/public/cardapio/loja-que-nao-existe`);
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

// 1x1 px PNG valido (menor imagem real possivel), usado so pra testar o pipeline de
// upload/armazenamento/serving - o conteudo em si nao importa pro teste.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

describe("Doc 32 - upload autohospedado da foto do item do cardapio", () => {
  async function criarItem(unidade: { id: string }, token: string) {
    const categoria = await request(app)
      .post(`/admin/unidades/${unidade.id}/cardapio/categorias`)
      .set("Authorization", `Bearer ${token}`)
      .send({ nome: "Pratos" });
    const item = await request(app)
      .post(`/admin/unidades/${unidade.id}/cardapio/itens`)
      .set("Authorization", `Bearer ${token}`)
      .send({ categoriaId: categoria.body.id, nome: "Pizza", precoCentavos: 4500 });
    return item.body as { id: string };
  }

  it("envia a imagem, grava no Postgres, e serve os bytes pela rota publica", async () => {
    const { unidade, token } = await setup();
    const item = await criarItem(unidade, token);

    const upload = await request(app)
      .post(`/admin/unidades/${unidade.id}/cardapio/itens/${item.id}/imagem`)
      .set("Authorization", `Bearer ${token}`)
      .attach("imagem", PNG_1X1, { filename: "foto.png", contentType: "image/png" });
    expect(upload.status).toBe(200);
    expect(upload.body.imagemUrl).toContain(`/public/cardapio/imagem/${item.id}`);

    const servida = await request(app).get(`/public/cardapio/imagem/${item.id}`);
    expect(servida.status).toBe(200);
    expect(servida.headers["content-type"]).toBe("image/png");
    expect(Buffer.compare(servida.body, PNG_1X1)).toBe(0);
  });

  it("rejeita arquivo de formato nao suportado", async () => {
    const { unidade, token } = await setup();
    const item = await criarItem(unidade, token);

    const upload = await request(app)
      .post(`/admin/unidades/${unidade.id}/cardapio/itens/${item.id}/imagem`)
      .set("Authorization", `Bearer ${token}`)
      .attach("imagem", Buffer.from("nao e uma imagem"), { filename: "arquivo.txt", contentType: "text/plain" });
    expect(upload.status).toBe(400);
  });

  it("404 ao enviar imagem pra item de outra unidade", async () => {
    const { unidade, token } = await setup();
    const outraEmpresa = await criarEmpresaComAdmin({ nomeEmpresa: "Outra Empresa Upload", emailAdmin: "outro-upload@teste.com" });
    const outroToken = await login(app, outraEmpresa.usuario.email, outraEmpresa.senhaAdmin);
    const itemDeOutra = await criarItem(outraEmpresa.unidade, outroToken);

    const upload = await request(app)
      .post(`/admin/unidades/${unidade.id}/cardapio/itens/${itemDeOutra.id}/imagem`)
      .set("Authorization", `Bearer ${token}`)
      .attach("imagem", PNG_1X1, { filename: "foto.png", contentType: "image/png" });
    expect(upload.status).toBe(404);
  });

  it("404 pra imagem de item inexistente na rota publica", async () => {
    const idFalso = "00000000-0000-0000-0000-000000000000";
    const resposta = await request(app).get(`/public/cardapio/imagem/${idFalso}`);
    expect(resposta.status).toBe(404);
  });
});
