import type { ReservaStatus, FilaEsperaStatus } from "../../types.js";

// "bloqueio" (doc redesign D1) nao e um status de reserva nem de fila - e o estado
// de um horario bloqueado manualmente pelo restaurante (BlocksPage). Reune os tres
// vocabularios de status que hoje cada pagina badge-ia com seu proprio mapa de texto
// local (ReservationsPage/WaitingListPage) num unico componente.
export type EstadoComBadge = ReservaStatus | FilaEsperaStatus | "bloqueio";

// Mesmos textos que ja existiam soltos em cada pagina (STATUS_LABEL local) - ver
// ReservationsPage.tsx/WaitingListPage.tsx. Migrar uma pagina pra usar StatusBadge
// no lugar do seu proprio badge+mapa e uma troca 1-pra-1, sem mudanca visual.
const ROTULO_PADRAO: Record<EstadoComBadge, string> = {
  pendente: "Pendente",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
  concluida: "Concluida",
  no_show: "Nao compareceu",
  esperando: "Esperando",
  chamado: "Chamado",
  sentado: "Sentado",
  desistiu: "Desistiu",
  bloqueio: "Bloqueado",
};

export interface StatusBadgeProps {
  estado: EstadoComBadge;
  // Sobrescreve o texto padrao quando o contexto pede algo mais especifico (raro -
  // na duvida, deixe o rotulo padrao, que ja e o texto usado hoje em producao).
  rotulo?: string;
}

// A cor (.badge-<estado>, tokens --status-* em index.css) NUNCA e o unico indicador
// do estado (doc redesign D1) - o texto do rotulo sempre acompanha, aqui e em todo
// lugar que usa esse padrao.
export function StatusBadge({ estado, rotulo }: StatusBadgeProps) {
  return <span className={`badge badge-${estado}`}>{rotulo ?? ROTULO_PADRAO[estado]}</span>;
}
