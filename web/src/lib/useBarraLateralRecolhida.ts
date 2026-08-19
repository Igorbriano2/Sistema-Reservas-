import { useEffect, useState } from "react";
import { useEhTablet } from "./useEhTablet.js";

const CHAVE = "barra_lateral_recolhida";

// Preferencia de menu lateral recolhido/expandido - persistida em localStorage,
// compartilhada entre o painel do restaurante e o painel da plataforma (mesmo
// gosto visual do usuario nos dois lugares). Doc redesign D4: quem NUNCA mexeu no
// toggle (sem valor salvo ainda) comeca recolhido se a primeira renderizacao
// acontecer na faixa tablet (768-1023px, ver useEhTablet) - fora dela, comeca
// expandido, igual sempre foi. So o padrao INICIAL muda; uma vez que o usuario
// mexe no toggle (em qualquer largura), a preferencia salva sempre prevalece.
export function useBarraLateralRecolhida() {
  const ehTabletNoPrimeiroRender = useEhTablet();
  const [recolhida, setRecolhida] = useState(() => {
    const salvo = localStorage.getItem(CHAVE);
    return salvo !== null ? salvo === "true" : ehTabletNoPrimeiroRender;
  });

  useEffect(() => {
    localStorage.setItem(CHAVE, String(recolhida));
  }, [recolhida]);

  return [recolhida, setRecolhida] as const;
}
