import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

// Codigo de entrada vindo do Orbita: o servidor do Orbita pede (com a chave da
// integracao) e o painel do Orbita abre <WEB_APP_URL>/entrar-orbita?codigo=... -
// a pagina troca o codigo por uma sessao normal do dono. Vale 2 minutos e carrega um
// "purpose" proprio para nunca ser aceito como token de sessao (ver jwt.ts).
const PROPOSITO = "orbita-sso";
const EXPIRACAO = "2m";

export interface OrbitaSsoPayload {
  sub: string; // usuario owner
  empresaId: string;
  unidadeId?: string;
}

function segredo(): string {
  return `${env.JWT_SECRET}:${PROPOSITO}`;
}

export function signOrbitaSso(dados: OrbitaSsoPayload): string {
  return jwt.sign({ ...dados, purpose: PROPOSITO }, segredo(), { expiresIn: EXPIRACAO });
}

export function verifyOrbitaSso(codigo: string): OrbitaSsoPayload {
  const p = jwt.verify(codigo, segredo()) as OrbitaSsoPayload & { purpose?: string };
  if (p.purpose !== PROPOSITO) throw new Error("Codigo invalido");
  return { sub: p.sub, empresaId: p.empresaId, ...(p.unidadeId && { unidadeId: p.unidadeId }) };
}
