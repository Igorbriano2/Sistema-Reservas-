import { useEffect, useState } from "react";

const CONSULTA = "(max-width: 720px)";

// Mesmo ponto de corte do CSS (.barra-lateral vira barra de abas fixa embaixo,
// doc 15) - usado pra achatar os submenus (Part B) na visao mobile, onde a
// barra de abas horizontal nao comporta grupos expansiveis.
export function useEhMobile(): boolean {
  const [ehMobile, setEhMobile] = useState(() => window.matchMedia(CONSULTA).matches);

  useEffect(() => {
    const mq = window.matchMedia(CONSULTA);
    const ouvinte = (e: MediaQueryListEvent) => setEhMobile(e.matches);
    mq.addEventListener("change", ouvinte);
    return () => mq.removeEventListener("change", ouvinte);
  }, []);

  return ehMobile;
}
