import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export type PapelUsuario = "owner" | "gerente" | "funcionario";

export interface AuthTokenPayload {
  sub: string; // usuario.id
  empresaId: string;
  papel: PapelUsuario;
}

const PAPEIS_VALIDOS: PapelUsuario[] = ["owner", "gerente", "funcionario"];

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded === "string") {
    throw new Error("Token invalido");
  }
  const { sub, empresaId, papel } = decoded as Partial<AuthTokenPayload>;
  if (!sub || !empresaId || !papel || !PAPEIS_VALIDOS.includes(papel)) {
    throw new Error("Token invalido");
  }
  return { sub, empresaId, papel };
}
