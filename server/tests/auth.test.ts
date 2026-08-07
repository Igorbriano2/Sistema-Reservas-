import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { verifyAuthToken } from "../src/lib/jwt.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";

const app = createApp();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

describe("POST /auth/login", () => {
  it("autentica com credenciais corretas e devolve um JWT valido", async () => {
    const { empresa, usuario, senhaAdmin } = await criarEmpresaComAdmin();

    const res = await request(app)
      .post("/auth/login")
      .send({ identificador: usuario.email, senha: senhaAdmin });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.usuario).toMatchObject({
      id: usuario.id,
      email: usuario.email,
      empresaId: empresa.id,
      papel: "owner",
    });
    expect(res.body.usuario.senhaHash).toBeUndefined();

    const payload = verifyAuthToken(res.body.token);
    expect(payload.sub).toBe(usuario.id);
    expect(payload.empresaId).toBe(empresa.id);
  });

  it("autentica pelo username tambem (mesma senha do e-mail)", async () => {
    const { usuario, senhaAdmin } = await criarEmpresaComAdmin();

    const res = await request(app)
      .post("/auth/login")
      .send({ identificador: usuario.username, senha: senhaAdmin });

    expect(res.status).toBe(200);
    expect(res.body.usuario.id).toBe(usuario.id);
  });

  it("rejeita senha incorreta com mensagem generica", async () => {
    const { usuario } = await criarEmpresaComAdmin();

    const res = await request(app)
      .post("/auth/login")
      .send({ identificador: usuario.email, senha: "senha-errada" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Usuario ou senha invalidos");
  });

  it("rejeita identificador inexistente com a MESMA mensagem generica (evita enumeracao)", async () => {
    const comSenhaErrada = await request(app)
      .post("/auth/login")
      .send({ identificador: "alguem@teste.com", senha: "qualquer" });

    const { usuario } = await criarEmpresaComAdmin();
    const comIdentificadorInexistente = await request(app)
      .post("/auth/login")
      .send({ identificador: "nao-existe@teste.com", senha: "qualquer" });
    const comSenhaErradaUsuarioReal = await request(app)
      .post("/auth/login")
      .send({ identificador: usuario.email, senha: "senha-errada" });

    expect(comIdentificadorInexistente.status).toBe(401);
    expect(comIdentificadorInexistente.body).toEqual(comSenhaErradaUsuarioReal.body);
    expect(comSenhaErrada.status).toBe(401);
  });

  it("rejeita corpo de requisicao invalido", async () => {
    const res = await request(app).post("/auth/login").send({ identificador: "" });
    expect(res.status).toBe(400);
  });
});

describe("GET /auth/me", () => {
  it("rejeita requisicao sem token", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
  });

  it("rejeita token invalido", async () => {
    const res = await request(app).get("/auth/me").set("Authorization", "Bearer token-invalido");
    expect(res.status).toBe(401);
  });

  it("devolve os dados do usuario autenticado", async () => {
    const { usuario, senhaAdmin } = await criarEmpresaComAdmin();
    const login = await request(app)
      .post("/auth/login")
      .send({ identificador: usuario.email, senha: senhaAdmin });

    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${login.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(usuario.id);
    expect(res.body.empresaId).toBe(usuario.empresaId);
  });

  it("cada empresa autentica de forma isolada (tokens nao se misturam entre empresas)", async () => {
    const empresaA = await criarEmpresaComAdmin({
      nomeEmpresa: "Empresa A",
      emailAdmin: "admin@a.com",
      senhaAdmin: "senha-a",
    });
    const empresaB = await criarEmpresaComAdmin({
      nomeEmpresa: "Empresa B",
      emailAdmin: "admin@b.com",
      senhaAdmin: "senha-b",
    });

    const loginA = await request(app)
      .post("/auth/login")
      .send({ identificador: empresaA.usuario.email, senha: empresaA.senhaAdmin });
    const loginB = await request(app)
      .post("/auth/login")
      .send({ identificador: empresaB.usuario.email, senha: empresaB.senhaAdmin });

    const meA = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${loginA.body.token}`);
    const meB = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${loginB.body.token}`);

    expect(meA.body.empresaId).toBe(empresaA.empresa.id);
    expect(meB.body.empresaId).toBe(empresaB.empresa.id);
    expect(meA.body.empresaId).not.toBe(meB.body.empresaId);
  });
});
