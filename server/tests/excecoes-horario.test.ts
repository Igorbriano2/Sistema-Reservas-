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

describe("Excecoes de horario / feriados municipais (doc 26)", () => {
  it("cria, lista e apaga uma data especial", async () => {
    const { unidade, token } = await setup();

    const criada = await request(app)
      .post(`/admin/unidades/${unidade.id}/excecoes-horario`)
      .set("Authorization", `Bearer ${token}`)
      .send({ data: "2026-12-21", nome: "Aniversario de Londrina" });
    expect(criada.status).toBe(201);
    expect(criada.body.nome).toBe("Aniversario de Londrina");
    expect(criada.body.fechado).toBe(false);

    const lista = await request(app).get(`/admin/unidades/${unidade.id}/excecoes-horario`).set("Authorization", `Bearer ${token}`);
    expect(lista.status).toBe(200);
    expect(lista.body).toHaveLength(1);

    const apagada = await request(app)
      .delete(`/admin/unidades/${unidade.id}/excecoes-horario/${criada.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(apagada.status).toBe(204);

    const listaVazia = await request(app).get(`/admin/unidades/${unidade.id}/excecoes-horario`).set("Authorization", `Bearer ${token}`);
    expect(listaVazia.body).toHaveLength(0);
  });

  it("rejeita duas datas especiais iguais na mesma unidade", async () => {
    const { unidade, token } = await setup();
    await request(app)
      .post(`/admin/unidades/${unidade.id}/excecoes-horario`)
      .set("Authorization", `Bearer ${token}`)
      .send({ data: "2026-12-21", nome: "Aniversario da cidade" });

    const duplicada = await request(app)
      .post(`/admin/unidades/${unidade.id}/excecoes-horario`)
      .set("Authorization", `Bearer ${token}`)
      .send({ data: "2026-12-21", nome: "De novo" });
    expect(duplicada.status).toBe(400);
  });

  it("rejeita horaFechamento menor ou igual a horaAbertura quando ambos informados", async () => {
    const { unidade, token } = await setup();
    const resposta = await request(app)
      .post(`/admin/unidades/${unidade.id}/excecoes-horario`)
      .set("Authorization", `Bearer ${token}`)
      .send({ data: "2026-12-24", nome: "Vespera de Natal", horaAbertura: "18:00", horaFechamento: "17:00" });
    expect(resposta.status).toBe(400);
  });

  it("uma unidade nao ve nem apaga excecao de outra unidade", async () => {
    const { unidade, token } = await setup();
    const outraEmpresa = await criarEmpresaComAdmin({ nomeEmpresa: "Outra", emailAdmin: "outra@teste.com" });
    const tokenOutra = await login(app, outraEmpresa.usuario.email, outraEmpresa.senhaAdmin);

    const criada = await request(app)
      .post(`/admin/unidades/${unidade.id}/excecoes-horario`)
      .set("Authorization", `Bearer ${token}`)
      .send({ data: "2026-12-21", nome: "Feriado da loja A" });

    const apagarDeFora = await request(app)
      .delete(`/admin/unidades/${unidade.id}/excecoes-horario/${criada.body.id}`)
      .set("Authorization", `Bearer ${tokenOutra}`);
    expect(apagarDeFora.status).toBe(404);
  });
});
