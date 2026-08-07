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

describe("PATCH /admin/agente-config (doc 13 - tracking de marketing)", () => {
  it("salva google_tag_id e facebook_pixel_id, e devolve no GET", async () => {
    const { token } = await setup();

    const patch = await request(app)
      .patch("/admin/agente-config")
      .set("Authorization", `Bearer ${token}`)
      .send({ googleTagId: "GT-ABC123", facebookPixelId: "1234567890" });
    expect(patch.status).toBe(200);
    expect(patch.body.googleTagId).toBe("GT-ABC123");
    expect(patch.body.facebookPixelId).toBe("1234567890");

    const get = await request(app).get("/admin/agente-config").set("Authorization", `Bearer ${token}`);
    expect(get.status).toBe(200);
    expect(get.body.googleTagId).toBe("GT-ABC123");
    expect(get.body.facebookPixelId).toBe("1234567890");
  });

  it("ids sao nulos por padrao (empresa que nunca configurou)", async () => {
    const { token } = await setup();
    const get = await request(app).get("/admin/agente-config").set("Authorization", `Bearer ${token}`);
    expect(get.status).toBe(200);
    expect(get.body.googleTagId).toBeNull();
    expect(get.body.facebookPixelId).toBeNull();
  });

  it("string vazia normaliza pra null (apaga o id salvo)", async () => {
    const { token } = await setup();
    await request(app)
      .patch("/admin/agente-config")
      .set("Authorization", `Bearer ${token}`)
      .send({ googleTagId: "GT-ABC123" });

    const apagar = await request(app)
      .patch("/admin/agente-config")
      .set("Authorization", `Bearer ${token}`)
      .send({ googleTagId: "" });
    expect(apagar.status).toBe(200);
    expect(apagar.body.googleTagId).toBeNull();
  });
});
