import type { ReactNode } from "react";

export interface EmptyStateProps {
  icone?: ReactNode;
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
}

// Estado vazio padrao (doc redesign D3) - hoje cada pagina resolve "nenhum item"
// sozinha (as vezes so a tabela some, sem contexto - ver ui-inventory.md). Sempre
// com mensagem + proxima acao sugerida (DESIGN.md, regras do Web App), nunca uma
// lista em branco sem explicacao.
export function EmptyState({ icone, titulo, descricao, acao }: EmptyStateProps) {
  return (
    <div className="estado-vazio">
      {icone && <div className="estado-vazio-icone">{icone}</div>}
      <p className="estado-vazio-titulo">{titulo}</p>
      {descricao && <p className="estado-vazio-descricao">{descricao}</p>}
      {acao}
    </div>
  );
}
