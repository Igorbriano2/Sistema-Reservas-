import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import request from "supertest";
import { createApp } from "../src/app.js";
import { db } from "../src/db/client.js";
import { waitlistLeads } from "../src/db/schema/index.js";
import { closeDb } from "./helpers/db.js";

const app = createApp();

beforeEach(async () => {
  await db.delete(waitlistLeads);
});

afterAll(async () => {
  await closeDb();
});

describe("POST /public/waitlist (formulario de contato da landing page)", () => {
  it("registra o interesse com os dados do formulario", async () => {
    const resposta = await request(app).post("/public/waitlist").send({
      nome: "Igor Briano",
      email: "igor@cervegela.com",
      whatsapp: "43988414050",
      nomeRestaurante: "Espetaria Cervegela",
    });

    expect(resposta.status).toBe(201);
    expect(resposta.body.id).toBeDefined();

    const [salvo] = await db.select().from(waitlistLeads).where(eq(waitlistLeads.id, resposta.body.id));
    expect(salvo.nome).toBe("Igor Briano");
    expect(salvo.email).toBe("igor@cervegela.com");
    expect(salvo.nomeRestaurante).toBe("Espetaria Cervegela");
  });

  it("rejeita email invalido sem criar nenhum registro", async () => {
    const resposta = await request(app).post("/public/waitlist").send({
      nome: "Igor Briano",
      email: "nao-e-um-email",
      whatsapp: "43988414050",
      nomeRestaurante: "Espetaria Cervegela",
    });

    expect(resposta.status).toBe(400);
    expect(await db.select().from(waitlistLeads)).toHaveLength(0);
  });

  it("rejeita corpo incompleto (campo obrigatorio faltando)", async () => {
    const resposta = await request(app).post("/public/waitlist").send({
      nome: "Igor Briano",
      email: "igor@cervegela.com",
    });

    expect(resposta.status).toBe(400);
  });
});
