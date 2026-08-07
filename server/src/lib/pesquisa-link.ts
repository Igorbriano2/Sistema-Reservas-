import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

// Token assinado do link publico de pesquisa de satisfacao (doc 21) - mesmo esquema
// de reservation-link.ts (JWT curto, proposito dedicado). Enviado por WhatsApp junto
// do template de feedback quando a empresa tem perguntas customizadas configuradas.
const PROPOSITO = "pesquisa_satisfacao" as const;
const EXPIRACAO = "7d";

export interface TokenDePesquisa {
  empresaId: string;
  reservaId: string;
  clienteTelefone: string;
}

export class TokenDePesquisaInvalidoError extends Error {
  constructor(message = "Link invalido ou expirado") {
    super(message);
    this.name = "TokenDePesquisaInvalidoError";
  }
}

function segredo(): string {
  return env.RESERVATION_LINK_SECRET ?? env.JWT_SECRET;
}

export function gerarTokenDePesquisa(dados: TokenDePesquisa): string {
  return jwt.sign(
    { empresaId: dados.empresaId, reservaId: dados.reservaId, clienteTelefone: dados.clienteTelefone, purpose: PROPOSITO },
    segredo(),
    { expiresIn: EXPIRACAO },
  );
}

export function decodificarTokenDePesquisa(token: string): TokenDePesquisa {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, segredo());
  } catch {
    throw new TokenDePesquisaInvalidoError();
  }

  if (typeof decoded === "string") {
    throw new TokenDePesquisaInvalidoError();
  }

  const { empresaId, reservaId, clienteTelefone, purpose } = decoded as Partial<TokenDePesquisa & { purpose: string }>;
  if (!empresaId || !reservaId || !clienteTelefone || purpose !== PROPOSITO) {
    throw new TokenDePesquisaInvalidoError();
  }
  return { empresaId, reservaId, clienteTelefone };
}
