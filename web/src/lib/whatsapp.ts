// Monta o link wa.me a partir de um telefone salvo em formato livre (BR local, com ou
// sem DDI) - normaliza para o formato internacional que o wa.me exige (so digitos,
// com codigo do pais). Numeros com 10-11 digitos (DDD + numero, sem "55") sao o caso
// mais comum no cadastro do painel; assume Brasil e prefixa o DDI nesse caso.
export function linkWhatsApp(telefone: string): string {
  const digitos = telefone.replace(/\D/g, "");
  const comDdi = digitos.length <= 11 ? `55${digitos}` : digitos;
  return `https://wa.me/${comDdi}`;
}
