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

// Chrome/Edge so disparam beforeinstallprompt sob certas condicoes de engajamento, e
// param de disparar de novo por um tempo apos o usuario fechar o prompt sem instalar -
// sem esse fallback manual, o botao simplesmente sumia (parecia ter sido removido) toda
// vez que o navegador decidia nao reoferecer o evento nessa visita.
function ehNavegadorChromium(): boolean {
  return /Chrome|Chromium|Edg\//.test(navigator.userAgent) && !/OPR\//.test(navigator.userAgent);
}

// Botao explicito de "Instalar app" no cabecalho do painel (doc 15) - sem isso, a
// unica forma de instalar era achar a opcao escondida no menu do navegador. No
// Chrome/Android usa o prompt nativo (beforeinstallprompt) quando disponivel; quando
// nao esta (ou no iOS Safari, que nunca dispara esse evento), mostra o passo a passo
// manual - o botao continua sempre visivel em qualquer navegador com suporte a PWA,
// em vez de desaparecer quando o evento nativo nao dispara.
export function InstalarAppButton() {
  const { instalavel, instalado, instalar } = useInstallPrompt();
  const [mostrarInstrucoes, setMostrarInstrucoes] = useState(false);
  const ios = ehIOS();
  const chromium = ehNavegadorChromium();

  if (instalado || (!instalavel && !ios && !chromium)) return null;

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="btn btn-secundario btn-icone"
        onClick={() => (instalavel ? instalar() : setMostrarInstrucoes((a) => !a))}
        aria-label="Instalar app"
        title="Instalar app no dispositivo"
      >
        <IconeInstalar />
      </button>
      {mostrarInstrucoes && (
        <div className="calendario-mes-flutuante" style={{ right: 0, left: "auto", width: 260 }}>
          {ios ? (
            <p style={{ margin: 0, fontSize: "0.85rem" }}>
              Toque em <strong>Compartilhar</strong> (ícone de quadrado com seta ↑) na barra do Safari e depois em{" "}
              <strong>Adicionar à Tela de Início</strong>.
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: "0.85rem" }}>
              No menu do navegador (⋮, canto superior direito) toque em <strong>Instalar app</strong> ou{" "}
              <strong>Adicionar à tela inicial</strong>. No computador, procure o ícone de instalar (⊕) na barra de
              endereço.
            </p>
          )}
          <button
            type="button"
            className="btn btn-secundario"
            style={{ marginTop: "0.75rem", width: "100%" }}
            onClick={() => setMostrarInstrucoes(false)}
          >
            Entendi
          </button>
        </div>
      )}
    </div>
  );
}
