import { useEffect, useRef, type ReactNode } from "react";

export interface ModalProps {
  titulo: ReactNode;
  aberto: boolean;
  aoFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
}

// Primeiro overlay centralizado generico do app (doc redesign D3) - hoje toda
// confirmacao usa window.confirm() nativo (ver BlocksPage/MenuPage/ReservationsPage/
// etc.) e os dois overlays existentes sao especificos (.calendario-mes-flutuante e
// .folha-mobile-nav, essa ultima so pra navegacao mobile). Este componente fica
// pronto pra uso, mas NAO substitui nenhum confirm() existente nesta etapa (Onda 0)
// - trocar um window.confirm por Modal e decisao de cada tela, na etapa dela.
export function Modal({ titulo, aberto, aoFechar, children, rodape }: ModalProps) {
  const caixaRef = useRef<HTMLDivElement>(null);
  // Chamadores costumam passar aoFechar como uma arrow function inline (ex:
  // aoFechar={() => setFormAberto(false)}) - referencia nova a cada render do pai.
  // Sem essa ref, aoFechar precisaria estar nas deps do efeito abaixo, e ele
  // re-rodaria a cada digitacao em qualquer campo do formulario (pai re-renderiza
  // por causa do estado do input, cria uma funcao aoFechar nova, dispara o efeito de
  // novo), chamando caixaRef.current?.focus() de novo e roubando o foco do campo que
  // o usuario estava digitando - bug real reportado: "precisa clicar no campo a cada
  // caractere". Guardando a versao mais recente numa ref, o efeito roda so quando
  // "aberto" muda de verdade, mas o handler de Escape sempre chama a funcao atual.
  const aoFecharRef = useRef(aoFechar);
  aoFecharRef.current = aoFechar;

  useEffect(() => {
    if (!aberto) return;

    const tetoAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    caixaRef.current?.focus();

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") aoFecharRef.current();
    }
    document.addEventListener("keydown", aoTeclar);

    return () => {
      document.body.style.overflow = tetoAnterior;
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  if (!aberto) return null;

  return (
    <div className="modal-fundo" onClick={aoFechar}>
      <div
        className="modal-caixa"
        role="dialog"
        aria-modal="true"
        aria-label={typeof titulo === "string" ? titulo : undefined}
        tabIndex={-1}
        ref={caixaRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-cabecalho">
          <strong>{titulo}</strong>
          <button type="button" className="btn btn-secundario btn-icone" aria-label="Fechar" onClick={aoFechar}>
            ✕
          </button>
        </div>
        <div className="modal-corpo">{children}</div>
        {rodape && <div className="modal-rodape">{rodape}</div>}
      </div>
    </div>
  );
}
