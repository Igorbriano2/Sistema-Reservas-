// Validacao de CPF/CNPJ 100% client-side (algoritmo de digito verificador padrao) -
// por decisao de escopo do checkout, o documento nunca precisa ser confirmado pelo
// backend antes do envio: e so uma validacao de formato, nao uma consulta a Receita.

function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

function todosDigitosIguais(digitos: string): boolean {
  return /^(\d)\1*$/.test(digitos);
}

function calcularDigitoVerificador(digitos: string, pesos: number[]): number {
  const soma = digitos.split("").reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function validarCpf(valor: string): boolean {
  const cpf = somenteDigitos(valor);
  if (cpf.length !== 11 || todosDigitosIguais(cpf)) return false;
  const d1 = calcularDigitoVerificador(cpf.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calcularDigitoVerificador(cpf.slice(0, 9) + d1, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cpf === cpf.slice(0, 9) + String(d1) + String(d2);
}

export function validarCnpj(valor: string): boolean {
  const cnpj = somenteDigitos(valor);
  if (cnpj.length !== 14 || todosDigitosIguais(cnpj)) return false;
  const d1 = calcularDigitoVerificador(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calcularDigitoVerificador(cnpj.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj === cnpj.slice(0, 12) + String(d1) + String(d2);
}

export function validarCpfOuCnpj(valor: string): boolean {
  const digitos = somenteDigitos(valor);
  if (digitos.length === 11) return validarCpf(digitos);
  if (digitos.length === 14) return validarCnpj(digitos);
  return false;
}

export function formatarCpfCnpj(valor: string): string {
  const digitos = somenteDigitos(valor).slice(0, 14);
  if (digitos.length <= 11) {
    return digitos
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return digitos
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}
