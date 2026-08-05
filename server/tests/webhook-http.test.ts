import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import request from "supertest";
import { createApp } from "../src/app.js";
import { closeDb, truncateAll } from "./helpers/db.js";

const app = createApp();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

function assinar(corpo: object): string {
  const payload = JSON.stringify(corpo);
  return `sha256=${createHmac("sha256", process.env.INSTAGRAM_APP_SECRET!).update(payload).digest("hex")}`;
}

describe("GET /agent/webhook (handshake de verificacao da Meta)", () => {
  it("ecoa o challenge quando o verify_token bate", async () => {
    const res = await request(app)
      .get("/agent/webhook")
      .query({ "hub.mode": "subscribe", "hub.verify_token": "test-verify-token", "hub.challenge": "12345" });
    expect(res.status).toBe(200);
    expect(res.text).toBe("12345");
  });

  it("rejeita quando o verify_token nao bate", async () => {
    const res = await request(app)
      .get("/agent/webhook")
      .query({ "hub.mode": "subscribe", "hub.verify_token": "token-errado", "hub.challenge": "12345" });
    expect(res.status).toBe(403);
  });
});

describe("POST /agent/webhook (assinatura)", () => {
  it("rejeita payload sem assinatura valida", async () => {
    const corpo = { object: "instagram", entry: [] };
    const res = await request(app)
      .post("/agent/webhook")
      .set("x-hub-signature-256", "sha256=assinatura-forjada")
      .send(corpo);
    expect(res.status).toBe(401);
  });

  it("aceita payload com assinatura valida e responde 200 mesmo sem eventos processaveis", async () => {
    const corpo = { object: "instagram", entry: [] };
    const res = await request(app)
      .post("/agent/webhook")
      .set("x-hub-signature-256", assinar(corpo))
      .send(corpo);
    expect(res.status).toBe(200);
  });

  it("responde 200 mesmo quando a conta do Instagram do evento e desconhecida", async () => {
    const corpo = {
      object: "instagram",
      entry: [
        {
          id: "conta-desconhecida",
          messaging: [
            {
              sender: { id: "ig-cliente-1" },
              recipient: { id: "conta-desconhecida" },
              message: { mid: "mid-1", text: "oi" },
            },
          ],
        },
      ],
    };
    const res = await request(app)
      .post("/agent/webhook")
      .set("x-hub-signature-256", assinar(corpo))
      .send(corpo);
    expect(res.status).toBe(200);
  });
});
