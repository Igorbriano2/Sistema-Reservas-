export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let onUnauthorized: (() => void) | null = null;

// Chamado pelo AuthContext para reagir a um 401 (token expirado/invalido) em
// qualquer chamada, de qualquer pagina, sem cada pagina precisar tratar isso.
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

export interface AssinaturaBloqueadaInfo {
  mensagem: string;
  motivo?: string;
}

let onAssinaturaBloqueada: ((info: AssinaturaBloqueadaInfo) => void) | null = null;
let onAssinaturaAviso: (() => void) | null = null;

// 402 = middleware de acesso (ver assinatura.middleware.ts no backend) bloqueou por
// causa do status da assinatura - diferente de 401, NAO desloga (o dono continua
// autenticado, so nao pode usar o resto do painel ate resolver).
export function setAssinaturaBloqueadaHandler(handler: ((info: AssinaturaBloqueadaInfo) => void) | null): void {
  onAssinaturaBloqueada = handler;
}

// Header X-Assinatura-Aviso: acesso liberado mas dentro do periodo de graca de uma
// cobranca atrasada - mostra um aviso nao bloqueante.
export function setAssinaturaAvisoHandler(handler: (() => void) | null): void {
  onAssinaturaAviso = handler;
}

function getToken(): string | null {
  return localStorage.getItem("token");
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    onUnauthorized?.();
  }

  if (res.headers.get("x-assinatura-aviso")) {
    onAssinaturaAviso?.();
  }

  if (!res.ok) {
    const corpo = await res.json().catch(() => ({}));
    if (res.status === 402) {
      onAssinaturaBloqueada?.({ mensagem: corpo.error ?? "Assinatura inativa.", motivo: corpo.motivo });
    }
    throw new ApiError(corpo.error ?? `Erro na requisicao (${res.status})`, res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
