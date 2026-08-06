import { env } from "../../config/env.js";

const temporizadores = new Map<string, NodeJS.Timeout>();

// Agrupa mensagens que chegam em rajada do mesmo cliente (mesma conversa): cada
// chamada cancela o temporizador anterior e comeca a contar de novo a partir da
// mensagem mais recente, entao o agente so e acionado quando a rajada realmente para
// por AGENT_DEBOUNCE_MS - processando de uma vez tudo que chegou nesse intervalo, em
// vez de responder mensagem por mensagem.
//
// Estado em memoria do processo: correto para uma unica instancia do servico (ver
// instance_count em .do/app.api.yaml). Com varias instancias rodando em paralelo,
// cada uma teria seu proprio temporizador e isso deixaria de funcionar direito -
// precisaria de um coordenador externo (Redis, etc.), fora do escopo do MVP.
export function agendarTurnoDoAgente(chave: string, executar: () => Promise<void>): void {
  const existente = temporizadores.get(chave);
  if (existente) {
    clearTimeout(existente);
  }

  const temporizador = setTimeout(() => {
    temporizadores.delete(chave);
    executar().catch((err) => {
      console.error(`[agente] erro ao processar turno agrupado (conversa ${chave}):`, err);
    });
  }, env.AGENT_DEBOUNCE_MS);

  temporizadores.set(chave, temporizador);
}

// So para os testes: garante que nao sobra nenhum temporizador pendente entre arquivos.
export function _cancelarTodosOsAgendamentosParaTeste(): void {
  for (const temporizador of temporizadores.values()) {
    clearTimeout(temporizador);
  }
  temporizadores.clear();
}
