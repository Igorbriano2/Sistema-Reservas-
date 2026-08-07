import { useEffect, useState } from "react";

const CHAVE = "barra_lateral_recolhida";

// Preferencia de menu lateral recolhido/expandido - persistida em localStorage,
// compartilhada entre o painel do restaurante e o painel da plataforma (mesmo
// gosto visual do usuario nos dois lugares).
export function useBarraLateralRecolhida() {
  const [recolhida, setRecolhida] = useState(() => localStorage.getItem(CHAVE) === "true");

  useEffect(() => {
    localStorage.setItem(CHAVE, String(recolhida));
  }, [recolhida]);

  return [recolhida, setRecolhida] as const;
}
