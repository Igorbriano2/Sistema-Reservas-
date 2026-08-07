import { useEffect, useState } from "react";

// Evento nao-padrao (soo Chrome/Edge/Android) - guardamos o proprio evento pra poder
// chamar .prompt() depois, quando o usuario clicar no botao (o navegador so permite
// isso uma vez, dentro de um gesto do usuario).
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function jaInstalado(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS Safari nao tem matchMedia display-mode, mas expoe isso no navigator.
  return (window.navigator as { standalone?: boolean }).standalone === true;
}

// beforeinstallprompt so existe no Chrome/Edge (Android/desktop) - iOS Safari nunca
// dispara isso, entao "instalavel" fica false la mesmo quando a instalacao manual
// (Compartilhar > Adicionar a Tela de Inicio) esta disponivel. Ver ehIOS() no
// componente pra mostrar instrucoes proprias nesse caso.
export function useInstallPrompt() {
  const [evento, setEvento] = useState<BeforeInstallPromptEvent | null>(null);
  const [instalado, setInstalado] = useState(jaInstalado);

  useEffect(() => {
    function aoFicarInstalavel(e: Event) {
      e.preventDefault();
      setEvento(e as BeforeInstallPromptEvent);
    }
    function aoInstalar() {
      setInstalado(true);
      setEvento(null);
    }

    window.addEventListener("beforeinstallprompt", aoFicarInstalavel);
    window.addEventListener("appinstalled", aoInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", aoFicarInstalavel);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);

  async function instalar(): Promise<void> {
    if (!evento) return;
    await evento.prompt();
    const escolha = await evento.userChoice;
    if (escolha.outcome === "accepted") setInstalado(true);
    setEvento(null);
  }

  return { instalavel: !!evento && !instalado, instalado, instalar };
}
