import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

// Protecao contra CSRF do fluxo OAuth: o "state" que mandamos pra Meta e um JWT curto
// que so nos sabemos verificar - se alguem forjar um callback com state adulterado
// (ou reusar um antigo), a verificacao falha. Mesmo padrao do token de link publico de
// reserva (ver reservation-link.ts): segredo dedicado com fallback pro JWT_SECRET,
// campo "purpose" evita cruzamento mesmo com segredo compartilhado.
const PROPOSITO = "instagram_oauth_state" as const;
const EXPIRACAO = "10m";

export interface InstagramOAuthState {
  empresaId: string;
}

export class InstagramOAuthStateInvalidoError extends Error {
  constructor(message = "State invalido ou expirado") {
    super(message);
    this.name = "InstagramOAuthStateInvalidoError";
  }
}

function segredo(): string {
  return env.INSTAGRAM_OAUTH_STATE_SECRET ?? env.JWT_SECRET;
}

export function gerarState(dados: InstagramOAuthState): string {
  return jwt.sign({ empresaId: dados.empresaId, purpose: PROPOSITO }, segredo(), { expiresIn: EXPIRACAO });
}

export function verificarState(state: string): InstagramOAuthState {
  let decoded: unknown;
  try {
    decoded = jwt.verify(state, segredo());
  } catch {
    throw new InstagramOAuthStateInvalidoError();
  }

  if (typeof decoded === "string") {
    throw new InstagramOAuthStateInvalidoError();
  }

  const { empresaId, purpose } = decoded as Partial<InstagramOAuthState & { purpose: string }>;
  if (!empresaId || purpose !== PROPOSITO) {
    throw new InstagramOAuthStateInvalidoError();
  }
  return { empresaId };
}
