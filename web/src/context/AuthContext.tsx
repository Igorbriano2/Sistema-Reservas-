import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  setAssinaturaAvisoHandler,
  setAssinaturaBloqueadaHandler,
  setUnauthorizedHandler,
  type AssinaturaBloqueadaInfo,
} from "../api/client.js";
import { listarUnidades, login as apiLogin } from "../api/resources.js";
import type { Permissao, Unidade, Usuario } from "../types.js";

interface AuthContextValue {
  usuario: Usuario | null;
  unidade: Unidade | null;
  unidades: Unidade[];
  carregando: boolean;
  erroInicial: string | null;
  isOwner: boolean;
  assinaturaBloqueada: AssinaturaBloqueadaInfo | null;
  assinaturaComAviso: boolean;
  login: (identificador: string, senha: string) => Promise<void>;
  logout: () => void;
  selecionarUnidade: (unidade: Unidade) => void;
  // Funcionalidade "configuravel" (editar_salao/ver_relatorios/etc, doc 17) na
  // unidade selecionada no momento - owner sempre true.
  temPermissaoNaUnidade: (permissao: Permissao) => boolean;
  // Mesma checagem, mas pra recursos que nao pertencem a uma unidade especifica
  // (agente-config, usuarios) - conta ter a permissao em QUALQUER loja com acesso.
  temPermissaoNaEmpresa: (permissao: Permissao) => boolean;
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
  const [assinaturaBloqueada, setAssinaturaBloqueada] = useState<AssinaturaBloqueadaInfo | null>(null);
  const [assinaturaComAviso, setAssinaturaComAviso] = useState(false);

  function limparSessao() {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    setUsuario(null);
    setUnidades([]);
    setUnidade(null);
    setAssinaturaBloqueada(null);
  }

  useEffect(() => {
    setUnauthorizedHandler(limparSessao);
    // 402 nao desloga (o dono continua autenticado) - so guarda o motivo pra a tela
    // de bloqueio aparecer no lugar do painel (ver RequireAuth em App.tsx).
    setAssinaturaBloqueadaHandler(setAssinaturaBloqueada);
    setAssinaturaAvisoHandler(() => setAssinaturaComAviso(true));
    return () => {
      setUnauthorizedHandler(null);
      setAssinaturaBloqueadaHandler(null);
      setAssinaturaAvisoHandler(null);
    };
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

  async function login(identificador: string, senha: string) {
    const { token, usuario: usuarioLogado } = await apiLogin(identificador, senha);
    localStorage.setItem("token", token);
    localStorage.setItem("usuario", JSON.stringify(usuarioLogado));
    setAssinaturaBloqueada(null);
    setUsuario(usuarioLogado);
  }

  const isOwner = usuario?.papel === "owner";

  function temPermissaoNaUnidade(permissao: Permissao): boolean {
    if (isOwner) return true;
    return !!unidade?.permissoesExtra?.includes(permissao);
  }

  function temPermissaoNaEmpresa(permissao: Permissao): boolean {
    if (isOwner) return true;
    return unidades.some((u) => u.permissoesExtra?.includes(permissao));
  }

  const value = useMemo(
    () => ({
      usuario,
      unidade,
      unidades,
      carregando,
      erroInicial,
      isOwner,
      assinaturaBloqueada,
      assinaturaComAviso,
      login,
      logout: limparSessao,
      selecionarUnidade: setUnidade,
      temPermissaoNaUnidade,
      temPermissaoNaEmpresa,
    }),
    [usuario, unidade, unidades, carregando, erroInicial, assinaturaBloqueada, assinaturaComAviso],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
