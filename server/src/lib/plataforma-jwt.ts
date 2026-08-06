import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

// Token de sessao do painel da plataforma (voce) - propositalmente SEM empresaId e
// SEM papel de usuario de restaurante. O campo "purpose" garante que um token de
// sessao normal (admin de restaurante) nunca seja aceito aqui, mesmo se os dois
// segredos coincidirem por fallback (ver PLATAFORMA_JWT_SECRET em env.ts).
const PROPOSITO = "plataforma_admin" as const;

export interface PlataformaAuthPayload {
  sub: string; // plataforma_admins.id
}

function segredo(): string {
  return env.PLATAFORMA_JWT_SECRET ?? env.JWT_SECRET;
}

export function signPlataformaToken(adminId: string): string {
  return jwt.sign({ sub: adminId, purpose: PROPOSITO }, segredo(), { expiresIn: "8h" });
}

export function verifyPlataformaToken(token: string): PlataformaAuthPayload {
  const decoded = jwt.verify(token, segredo());
  if (typeof decoded === "string") {
    throw new Error("Token invalido");
  }
  const { sub, purpose } = decoded as Partial<PlataformaAuthPayload & { purpose: string }>;
  if (!sub || purpose !== PROPOSITO) {
    throw new Error("Token invalido");
  }
  return { sub };
}
