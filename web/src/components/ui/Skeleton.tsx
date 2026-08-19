export interface SkeletonProps {
  // Altura da barra (o resto vem do contexto - width sempre 100% do container).
  altura?: string;
  className?: string;
}

// Placeholder de carregamento (doc redesign, achado #5 da auditoria) - troca o
// "Carregando..." em texto plano por uma barra que ja ocupa o espaco real do
// conteudo, evitando o salto de layout (CLS) quando os dados chegam. Uso tipico:
// algumas Skeleton empilhadas simulando as linhas/cards que vao aparecer.
export function Skeleton({ altura = "1rem", className }: SkeletonProps) {
  return <div className={["skeleton", className].filter(Boolean).join(" ")} style={{ height: altura }} />;
}
