import { ApiError } from "../api/client.js";

// Cliente de API separado do painel de restaurante (api/client.ts): le/grava um token
// diferente ("plataforma_token", nao "token") pra que entrar em modo teste - que
// escreve um token de restaurante em "token" - nunca derrube a sua propria sessao
// aqui, e vice-versa.
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

let onUnauthorized: (() => void) | null = null;

export function setPlataformaUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

function getToken(): string | null {
  return localStorage.getItem("plataforma_token");
}

async function plataformaFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
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

  if (!res.ok) {
    const corpo = await res.json().catch(() => ({}));
    throw new ApiError(corpo.error ?? `Erro na requisicao (${res.status})`, res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export const plataformaApi = {
  get: <T>(path: string) => plataformaFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    plataformaFetch<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    plataformaFetch<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => plataformaFetch<T>(path, { method: "DELETE" }),
};
