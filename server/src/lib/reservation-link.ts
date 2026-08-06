import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

// Segredo dedicado para o link publico de reserva; cai para JWT_SECRET se nao configurado
// (ver env.ts). O campo "purpose" abaixo garante que um token de sessao do admin nunca
// seja aceito aqui por engano, mesmo quando os dois usam o mesmo segredo por fallback.
const PROPOSITO = "reservation_link" as const;
const EXPIRACAO = "60m";

export interface TokenDeReserva {
  unidadeId: string;
  igSenderId: string;
}

export class TokenDeReservaInvalidoError extends Error {
  constructor(message = "Link invalido ou expirado") {
    super(message);
    this.name = "TokenDeReservaInvalidoError";
  }
}

function segredo(): string {
  return env.RESERVATION_LINK_SECRET ?? env.JWT_SECRET;
}

// Gerado pela tool get_reservation_link (agente) e enviado ao cliente via Instagram.
// Curto (60min) de proposito: o link e descartavel, um novo e gerado a cada pedido.
export function gerarTokenDeReserva(dados: TokenDeReserva): string {
  return jwt.sign({ unidadeId: dados.unidadeId, igSenderId: dados.igSenderId, purpose: PROPOSITO }, segredo(), {
    expiresIn: EXPIRACAO,
  });
}

export function decodificarTokenDeReserva(token: string): TokenDeReserva {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, segredo());
  } catch {
    throw new TokenDeReservaInvalidoError();
  }

  if (typeof decoded === "string") {
    throw new TokenDeReservaInvalidoError();
  }

  const { unidadeId, igSenderId, purpose } = decoded as Partial<TokenDeReserva & { purpose: string }>;
  if (!unidadeId || !igSenderId || purpose !== PROPOSITO) {
    throw new TokenDeReservaInvalidoError();
  }
  return { unidadeId, igSenderId };
}
