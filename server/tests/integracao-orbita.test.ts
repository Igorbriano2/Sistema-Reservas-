import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const CHAVE = vi.hoisted(() => {
  const c = "chave-integracao-orbita-teste-1234567890ab";
  process.env.INTEGRACAO_ORBITA_SECRET = c;
  return c;
});
import request from "supertest";
import { eq } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { db } from "../src/db/client.js";
import { empresas } from "../src/db/schema/index.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
import { criarMesa, criarReservaDireta, criarSalao } from "./helpers/fixtures.js";

const app = createApp();
const auth = { Authorization: `Bearer ${CHAVE}` };

beforeEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await closeDb();
});

describe("Integracao com o Orbita", () => {
  it("recusa sem a chave e com chave errada", async () => {
    expect((await request(app).get("/integracao/orbita/empresas")).status).toBe(401);
    expect((await request(app).get("/integracao/orbita/empresas").set("Authorization", "Bearer errada")).status).toBe(401);
  });

  it("cria a empresa do cliente do Orbita (idempotente), ativa e com as unidades, e abre o painel ja logado", async () => {
    const corpo = {
      orbitaTenantId: "tenant-123",
      nome: "Dog King",
      dono: { nome: "Igor", email: "dono@dogking.test" },
      unidades: [{ nome: "Dog King Cambe", endereco: "Av. Brasil, 10" }, { nome: "Dog King Londrina" }],
    };
    const r1 = await request(app).post("/integracao/orbita/empresas").set(auth).send(corpo);
    expect(r1.status).toBe(201);
    expect(r1.body).toMatchObject({ nome: "Dog King", orbitaTenantId: "tenant-123", assinaturaStatus: "ativo" });
    expect(r1.body.unidades.map((u: { nome: string }) => u.nome).sort()).toEqual(["Dog King Cambe", "Dog King Londrina"]);
    const r2 = await request(app).post("/integracao/orbita/empresas").set(auth).send(corpo);
    expect(r2.status).toBe(200);
    expect(r2.body.id).toBe(r1.body.id);

    const unidadeId = r1.body.unidades[0].id;
    const sso = await request(app).post(`/integracao/orbita/empresas/${r1.body.id}/sso`).set(auth).send({ unidadeId, destino: "/admin/reservas" });
    expect(sso.status).toBe(200);
    expect(sso.body.url).toContain("/entrar-orbita?codigo=");
    const entrada = await request(app).post("/auth/orbita-sso").send({ codigo: sso.body.codigo });
    expect(entrada.status).toBe(200);
    expect(entrada.body.usuario).toMatchObject({ email: "dono@dogking.test", papel: "owner", empresaId: r1.body.id });
    expect(entrada.body.unidadeId).toBe(unidadeId);
    // a sessao funciona no painel
    const me = await request(app).get("/auth/me").set("Authorization", `Bearer ${entrada.body.token}`);
    expect(me.status).toBe(200);
    // o codigo nao vale como sessao
    expect((await request(app).get("/auth/me").set("Authorization", `Bearer ${sso.body.codigo}`)).status).toBe(401);
    expect((await request(app).post("/auth/orbita-sso").send({ codigo: "x".repeat(40) })).status).toBe(401);
  });

  it("nao cria conta duplicada para e-mail ja cadastrado: pede para vincular; vincula e desvincula", async () => {
    const { empresa } = await criarEmpresaComAdmin({ nomeEmpresa: "Cervegela", emailAdmin: "dono@cervegela.test" });
    const dup = await request(app)
      .post("/integracao/orbita/empresas")
      .set(auth)
      .send({ orbitaTenantId: "t-9", nome: "Cervegela", dono: { nome: "Dono", email: "dono@cervegela.test" }, unidades: [{ nome: "Cervegela" }] });
    expect(dup.status).toBe(409);

    const busca = await request(app).get("/integracao/orbita/empresas?busca=cerve").set(auth);
    expect(busca.body).toEqual([{ id: empresa.id, nome: "Cervegela", orbitaTenantId: null }]);
    const v = await request(app).post(`/integracao/orbita/empresas/${empresa.id}/vincular`).set(auth).send({ orbitaTenantId: "t-9" });
    expect(v.status).toBe(200);
    expect(v.body.orbitaTenantId).toBe("t-9");
    const outro = await request(app).post(`/integracao/orbita/empresas/${empresa.id}/vincular`).set(auth).send({ orbitaTenantId: "t-10" });
    expect(outro.status).toBe(409);
    expect((await request(app).delete(`/integracao/orbita/empresas/${empresa.id}/vinculo`).set(auth)).status).toBe(204);
    const [e] = await db.select().from(empresas).where(eq(empresas.id, empresa.id));
    expect(e!.orbitaTenantId).toBeNull();
  });

  it("lista as reservas da empresa por periodo, com mesa e salao", async () => {
    const { empresa, unidade } = await criarEmpresaComAdmin({ nomeEmpresa: "Cervegela", emailAdmin: "dono2@cervegela.test" });
    const salao = await criarSalao(unidade.id, "Varanda");
    const mesa = await criarMesa(salao.id, { nome: "Mesa 7" });
    await criarReservaDireta(unidade.id, mesa.id, null, { data: "2026-11-20", horaInicio: "20:00", clienteNome: "Ana", clienteTelefone: "43999990000", numPessoas: 4 });
    await criarReservaDireta(unidade.id, mesa.id, null, { data: "2026-12-30", horaInicio: "20:00" });
    const r = await request(app).get(`/integracao/orbita/empresas/${empresa.id}/reservas?de=2026-11-01&ate=2026-11-30`).set(auth);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0]).toMatchObject({ clienteNome: "Ana", numPessoas: 4, data: "2026-11-20", mesaNome: "Mesa 7", salaoNome: "Varanda", status: "confirmada" });
    expect((await request(app).get(`/integracao/orbita/empresas/${empresa.id}/reservas?de=2026-01-01&ate=2026-12-31`).set(auth)).status).toBe(400);
  });
});
