import request from "supertest";
import type { Express } from "express";

export async function login(app: Express, email: string, senha: string): Promise<string> {
  const res = await request(app).post("/auth/login").send({ email, senha });
  if (res.status !== 200) {
    throw new Error(`Login falhou no teste: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.token as string;
}
