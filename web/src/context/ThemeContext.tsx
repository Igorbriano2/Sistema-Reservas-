import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Tema = "dark" | "light";

const CHAVE_TEMA = "tema_preferido";
// Mesmos valores de --bg-base de cada tema em index.css - o <meta name="theme-color">
// e um atributo estatico (nao le CSS var), entao precisa ser atualizado aqui tambem.
const THEME_COLOR: Record<Tema, string> = { dark: "#0d0d0d", light: "#f5efe8" };

interface ThemeContextValue {
  tema: Tema;
  alternarTema: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function lerTemaSalvo(): Tema {
  const salvo = localStorage.getItem(CHAVE_TEMA);
  return salvo === "light" ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(lerTemaSalvo);

  useEffect(() => {
    // Tema escuro e o padrao de :root sem atributo - so marca o atributo pro
    // claro, evitando poluir o DOM com data-theme="dark" o tempo todo.
    if (tema === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    localStorage.setItem(CHAVE_TEMA, tema);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEME_COLOR[tema]);
  }, [tema]);

  function alternarTema() {
    setTema((atual) => (atual === "dark" ? "light" : "dark"));
  }

  return <ThemeContext.Provider value={{ tema, alternarTema }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme deve ser usado dentro de ThemeProvider");
  return ctx;
}
