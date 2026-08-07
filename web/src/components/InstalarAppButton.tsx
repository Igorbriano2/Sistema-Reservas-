import { useState } from "react";
import { useInstallPrompt } from "../lib/useInstallPrompt.js";

function IconeInstalar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12m0 0-4-4m4 4 4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

function ehIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

// Botao explicito de "Instalar app" no cabecalho do painel (doc 15) - sem isso, a
// unica forma de instalar era achar a opcao escondida no menu do navegador. No
// Chrome/Android usa o prompt nativo (beforeinstallprompt); no iOS Safari, que nunca
// dispara esse evento, mostra o passo a passo manual (Compartilhar > Adicionar a Tela
// de Inicio) - e o unico jeito de instalar la, nao tem API pra automatizar.
export function InstalarAppButton() {
  const { instalavel, instalado, instalar } = useInstallPrompt();
  const [mostrarInstrucoesIOS, setMostrarInstrucoesIOS] = useState(false);
  const ios = ehIOS();

  if (instalado || (!instalavel && !ios)) return null;

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="btn btn-secundario btn-icone"
        onClick={() => (ios ? setMostrarInstrucoesIOS((a) => !a) : instalar())}
        aria-label="Instalar app"
        title="Instalar app no dispositivo"
      >
        <IconeInstalar />
      </button>
      {mostrarInstrucoesIOS && (
        <div className="calendario-mes-flutuante" style={{ right: 0, left: "auto", width: 260 }}>
          <p style={{ margin: 0, fontSize: "0.85rem" }}>
            Toque em <strong>Compartilhar</strong> (ícone de quadrado com seta ↑) na barra do Safari e depois em{" "}
            <strong>Adicionar à Tela de Início</strong>.
          </p>
          <button
            type="button"
            className="btn btn-secundario"
            style={{ marginTop: "0.75rem", width: "100%" }}
            onClick={() => setMostrarInstrucoesIOS(false)}
          >
            Entendi
          </button>
        </div>
      )}
    </div>
  );
}
