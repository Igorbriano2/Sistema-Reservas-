// Orbes desfocadas flutuando atras de tudo (redesign Apple-style, "Spatial UI") - so
// visual, sem estado nem logica: nao le nada da aplicacao, so decora o fundo. Montado
// uma unica vez em App.tsx, cobre o app inteiro (admin, painel da plataforma, paginas
// publicas, landing) via position:fixed + z-index negativo (ver .particulas-ambiente
// em index.css). Posicoes/atrasos fixos (nao aleatorios) pra nao mudar a cada render.
const PARTICULAS = [
  { top: "-10%", left: "8%", size: 420, delay: "0s" },
  { top: "55%", left: "-8%", size: 340, delay: "-8s" },
  { top: "70%", left: "78%", size: 460, delay: "-16s" },
  { top: "5%", left: "82%", size: 300, delay: "-4s" },
];

export function AmbientParticles() {
  return (
    <div className="particulas-ambiente" aria-hidden="true">
      {PARTICULAS.map((p, i) => (
        <span
          key={i}
          className="particula"
          style={{
            top: p.top,
            left: p.left,
            width: p.size,
            height: p.size,
            animationDelay: p.delay,
          }}
        />
      ))}
    </div>
  );
}
