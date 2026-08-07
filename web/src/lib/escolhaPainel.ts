// Fluxo pos-login "escolha o painel e a loja" (inspirado no GetIn) - guarda a
// escolha em sessionStorage (nao localStorage): cada login novo (nova aba/janela)
// volta a perguntar, mas recarregar a mesma aba mantem a escolha feita.
export type PainelModo = "gestao" | "operacao";

const CHAVE_MODO = "painel_modo";
const CHAVE_FLUXO_COMPLETO = "admin_fluxo_escolhido";

export function obterPainelModo(): PainelModo | null {
  const valor = sessionStorage.getItem(CHAVE_MODO);
  return valor === "gestao" || valor === "operacao" ? valor : null;
}

export function definirPainelModo(modo: PainelModo) {
  sessionStorage.setItem(CHAVE_MODO, modo);
}

export function fluxoEscolhaCompleto(): boolean {
  return sessionStorage.getItem(CHAVE_FLUXO_COMPLETO) === "1";
}

export function marcarFluxoCompleto() {
  sessionStorage.setItem(CHAVE_FLUXO_COMPLETO, "1");
}

export function limparFluxoEscolha() {
  sessionStorage.removeItem(CHAVE_MODO);
  sessionStorage.removeItem(CHAVE_FLUXO_COMPLETO);
}
