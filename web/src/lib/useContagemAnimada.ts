import { useEffect, useState } from "react";

// Anima um numero de 0 ate o valor final (efeito "contagem") quando `ativo` liga - so
// roda depois que os dados carregaram, pra nao animar em cima do placeholder "-".
// Extraido de DashboardPage (doc redesign) pra ser reaproveitado por qualquer tela com
// cartoes de metrica no mesmo estilo (ex: RelatorioDiarioPage).
export function useContagemAnimada(valor: number, ativo: boolean, duracaoMs = 700): number {
  const [exibido, setExibido] = useState(0);

  useEffect(() => {
    if (!ativo) return;
    let inicio: number | null = null;
    let quadro: number;
    function passo(tempo: number) {
      if (inicio === null) inicio = tempo;
      const progresso = Math.min((tempo - inicio) / duracaoMs, 1);
      setExibido(Math.round(valor * progresso));
      if (progresso < 1) quadro = requestAnimationFrame(passo);
    }
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [valor, ativo, duracaoMs]);

  return exibido;
}
