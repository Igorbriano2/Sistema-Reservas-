import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { setPlataformaUnauthorizedHandler } from "./api.js";
import { plataformaLogin } from "./resources.js";
import type { PlataformaAdmin } from "./types.js";

interface PlataformaAuthContextValue {
  admin: PlataformaAdmin | null;
  login: (email: string, senha: string) => Promise<void>;
  logout: () => void;
}

const PlataformaAuthContext = createContext<PlataformaAuthContextValue | null>(null);

export function PlataformaAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<PlataformaAdmin | null>(() => {
    const salvo = localStorage.getItem("plataforma_admin");
    return salvo ? (JSON.parse(salvo) as PlataformaAdmin) : null;
  });

  function limparSessao() {
    localStorage.removeItem("plataforma_token");
    localStorage.removeItem("plataforma_admin");
    setAdmin(null);
  }

  useEffect(() => {
    setPlataformaUnauthorizedHandler(limparSessao);
    return () => setPlataformaUnauthorizedHandler(null);
  }, []);

  async function login(email: string, senha: string) {
    const { token, admin: adminLogado } = await plataformaLogin(email, senha);
    localStorage.setItem("plataforma_token", token);
    localStorage.setItem("plataforma_admin", JSON.stringify(adminLogado));
    setAdmin(adminLogado);
  }

  const value = useMemo(() => ({ admin, login, logout: limparSessao }), [admin]);

  return <PlataformaAuthContext.Provider value={value}>{children}</PlataformaAuthContext.Provider>;
}

export function usePlataformaAuth(): PlataformaAuthContextValue {
  const ctx = useContext(PlataformaAuthContext);
  if (!ctx) throw new Error("usePlataformaAuth deve ser usado dentro de PlataformaAuthProvider");
  return ctx;
}
