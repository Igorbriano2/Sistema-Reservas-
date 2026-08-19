import type { HTMLAttributes } from "react";

// Badge neutro generico (.badge, index.css) - sem semantica de status (ver
// StatusBadge.tsx pra isso). Uso: contagens, tags, rotulos que nao representam um
// estado de reserva/fila/bloqueio.
export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={["badge", className].filter(Boolean).join(" ")} {...props} />;
}
