import { useEffect, useRef, useState, type CSSProperties, type ElementType, type MouseEvent, type ReactNode } from "react";

function prefereMovimentoReduzido(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Revela um bloco ao entrar na tela (uma vez so, depois desconecta - diferente do
// antigo .lp-reveal bidirecional). delay em ms permite escalonar itens de uma mesma
// grade/lista.
export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className = "",
  style,
}: {
  children: ReactNode;
  delay?: number;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefereMovimentoReduzido()) {
      setVisivel(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entrada]) => {
        if (entrada?.isIntersecting) {
          setVisivel(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`lp-reveal-fx ${visivel ? "visivel" : ""} ${className}`}
      style={{ ...style, "--reveal-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}

// Barra fina no topo da pagina mostrando o quanto ja rolou.
export function BarraDeProgresso() {
  const [porcentagem, setPorcentagem] = useState(0);

  useEffect(() => {
    function aoRolar() {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      setPorcentagem(max > 0 ? (el.scrollTop / max) * 100 : 0);
    }
    aoRolar();
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, []);

  return (
    <div className="lp-progresso-rolagem">
      <div className="lp-progresso-rolagem-barra" style={{ width: `${porcentagem}%` }} />
    </div>
  );
}

// Fundo ambiente com 3 manchas desfocadas animadas - decorativo, atras do conteudo.
export function Aurora({ intenso = false }: { intenso?: boolean }) {
  return (
    <div className="lp-aurora" aria-hidden="true">
      <div
        className="lp-aurora-blob"
        style={{
          left: "8%",
          top: "-14%",
          width: 460,
          height: 460,
          background: "rgba(var(--accent-rgb), 0.55)",
          opacity: intenso ? 0.75 : 0.4,
        }}
      />
      <div
        className="lp-aurora-blob"
        style={{
          right: "4%",
          top: "6%",
          width: 380,
          height: 380,
          background: "rgba(216, 27, 90, 0.5)",
          animationDelay: "-6s",
          opacity: intenso ? 0.6 : 0.32,
        }}
      />
      <div
        className="lp-aurora-blob"
        style={{
          left: "38%",
          top: "38%",
          width: 300,
          height: 300,
          background: "rgba(190, 90, 40, 0.4)",
          animationDelay: "-11s",
          opacity: 0.3,
        }}
      />
    </div>
  );
}

// Cartao com brilho radial seguindo o mouse (--mx/--my via style inline).
export function SpotCard({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  function aoMover(e: MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  }

  return (
    <div onMouseMove={aoMover} className={`lp-spot-card ${className}`} style={style}>
      {children}
    </div>
  );
}

// Faixa de destaques rolando infinitamente (duplica a lista pra fechar o loop).
export function Marquee({ itens }: { itens: string[] }) {
  const linha = [...itens, ...itens];
  return (
    <div className="lp-marquee">
      <div className="lp-marquee-fade" aria-hidden="true" />
      <div className="lp-marquee-trilho">
        {linha.map((item, i) => (
          <span className="lp-marquee-item" key={`${item}-${i}`}>
            <span className="lp-marquee-ponto" aria-hidden="true" />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
