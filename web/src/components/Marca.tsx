interface MarcaProps {
  tamanho?: "normal" | "grande";
}

// Logotipo "Quero Reservar": a cadeira em tres blocos solidos (simbolo da
// identidade visual - encosto, assento, pernas) mais o nome em Bodoni Moda,
// com "Reservar" em italico.
export function Marca({ tamanho = "normal" }: MarcaProps) {
  return (
    <span className={`marca ${tamanho === "grande" ? "marca-grande" : ""}`}>
      <svg viewBox="0 0 200 200" className="marca-etiqueta" aria-hidden="true">
        <rect x="65" y="30" width="70" height="60" rx="20" fill="currentColor" />
        <rect x="46" y="94" width="108" height="24" rx="12" fill="currentColor" />
        <rect x="54" y="120" width="16" height="40" rx="7" fill="currentColor" />
        <rect x="130" y="120" width="16" height="40" rx="7" fill="currentColor" />
      </svg>
      <span className="marca-texto">
        Quero <em>Reservar</em>
      </span>
    </span>
  );
}
