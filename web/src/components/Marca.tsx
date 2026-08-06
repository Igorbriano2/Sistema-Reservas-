import { useId } from "react";

interface MarcaProps {
  tamanho?: "normal" | "grande";
}

// Logotipo "Quero Reservar": a etiqueta de reserva (simbolo da identidade visual)
// mais o nome em Bodoni Moda, com "Reservar" em italico.
export function Marca({ tamanho = "normal" }: MarcaProps) {
  const maskId = useId();

  return (
    <span className={`marca ${tamanho === "grande" ? "marca-grande" : ""}`}>
      <svg viewBox="0 0 24 24" className="marca-etiqueta" aria-hidden="true">
        <mask id={maskId}>
          <rect width="24" height="24" fill="#fff" />
          <circle cx="16.5" cy="7.5" r="1.6" fill="#000" />
        </mask>
        <path
          d="M2.5 4A1.5 1.5 0 0 1 4 2.5h8.34c.4 0 .78.16 1.06.44l8.16 8.16a1.5 1.5 0 0 1 0 2.12l-8.78 8.78a1.5 1.5 0 0 1-2.12 0l-8.16-8.16A1.5 1.5 0 0 1 2.5 12.34V4z"
          fill="currentColor"
          mask={`url(#${maskId})`}
        />
      </svg>
      <span className="marca-texto">
        Quero <em>Reservar</em>
      </span>
    </span>
  );
}
