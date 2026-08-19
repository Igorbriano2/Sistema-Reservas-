import { useEffect, useState } from "react";

const CONSULTA = "(min-width: 768px) and (max-width: 1023px)";

// Faixa tablet (doc redesign D4) - entre o mobile (useEhMobile, <768px) e o
// desktop (>=1024px). Usado hoje so pra decidir o padrao INICIAL da sidebar
// recolhida (ver useBarraLateralRecolhida.ts) quando o usuario nunca mexeu no
// toggle - precisa ficar em sincronia manual com o @media equivalente em index.css.
export function useEhTablet(): boolean {
  const [ehTablet, setEhTablet] = useState(() => window.matchMedia(CONSULTA).matches);

  useEffect(() => {
    const mq = window.matchMedia(CONSULTA);
    const ouvinte = (e: MediaQueryListEvent) => setEhTablet(e.matches);
    mq.addEventListener("change", ouvinte);
    return () => mq.removeEventListener("change", ouvinte);
  }, []);

  return ehTablet;
}
