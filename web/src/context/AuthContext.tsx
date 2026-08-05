import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { setUnauthorizedHandler } from "../api/client.js";
import { listarUnidades, login as apiLogin } from "../api/resources.js";
import type { Unidade, Usuario } from "../types.js";

interface AuthContextValue {
  usuario: Usuario | null;
  unidade: Unidade | null;
  unidades: Unidade[];
  carregando: boolean;
  erroInicial: string | null;
  isOwner: boolean;
  login: (email: string, senha: string) => Promise<void>;
  logout: () => void;
  selecionarUnidade: (unidade: Unidade) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(() => {
    const salvo = localStorage.getItem("usuario");
    return salvo ? (JSON.parse(salvo) as Usuario) : null;
  });
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [unidade, setUnidade] = useState<Unidade | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroInicial, setErroInicial] = useState<string | null>(null);

  function limparSessao() {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    setUsuario(null);
    setUnidades([]);
    setUnidade(null);
  }

  useEffect(() => {
    setUnauthorizedHandler(limparSessao);
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    if (!usuario) {
      setCarregando(false);
      return;
    }
    listarUnidades()
      .then((lista) => {
        setUnidades(lista);
        if (lista.length > 0) setUnidade(lista[0]);
      })
      .catch(() => setErroInicial("Nao foi possivel carregar as unidades da empresa."))
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.id]);

  async function login(email: string, senha: string) {
    const { token, usuario: usuarioLogado } = await apiLogin(email, senha);
    localStorage.setItem("token", token);
    localStorage.setItem("usuario", JSON.stringify(usuarioLogado));
    setUsuario(usuarioLogado);
  }

  const value = useMemo(
    () => ({
      usuario,
      unidade,
      unidades,
      carregando,
      erroInicial,
      isOwner: usuario?.papel === "owner",
      login,
      logout: limparSessao,
      selecionarUnidade: setUnidade,
    }),
    [usuario, unidade, unidades, carregando, erroInicial],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
