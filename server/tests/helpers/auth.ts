import request from "supertest";
import type { Express } from "express";

export async function login(app: Express, identificador: string, senha: string): Promise<string> {
  const res = await request(app).post("/auth/login").send({ identificador, senha });
  if (res.status !== 200) {
    throw new Error(`Login falhou no teste: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.token as string;
}
