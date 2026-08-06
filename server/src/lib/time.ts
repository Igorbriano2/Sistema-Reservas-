// Horarios do Postgres (tipo "time") chegam como string "HH:MM:SS".
// Estas funcoes tratam tudo em minutos desde 00:00 para facilitar aritmetica e comparacao.

export function paraMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

export function paraHora(minutos: number): string {
  const m = ((minutos % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`;
}

export function somarMinutos(hora: string, minutos: number): string {
  return paraHora(paraMinutos(hora) + minutos);
}

// Intervalos [inicio, fim) se sobrepoem?
export function intervalosSeSobrepoem(
  inicioA: number,
  fimA: number,
  inicioB: number,
  fimB: number,
): boolean {
  return inicioA < fimB && inicioB < fimA;
}

// 0 = domingo ... 6 = sabado, calculado em UTC para nao depender do fuso do processo.
export function diaDaSemana(dataISO: string): number {
  return new Date(`${dataISO}T00:00:00Z`).getUTCDay();
}

// Lista, em ordem, cada data (YYYY-MM-DD) entre dataInicio e dataFim, incluindo as
// duas pontas. Usado pelos relatorios pra somar capacidade dia a dia.
export function enumerarDatas(dataInicio: string, dataFim: string): string[] {
  const datas: string[] = [];
  let atual = new Date(`${dataInicio}T00:00:00Z`);
  const fim = new Date(`${dataFim}T00:00:00Z`);
  while (atual <= fim) {
    datas.push(atual.toISOString().slice(0, 10));
    atual = new Date(atual.getTime() + 24 * 60 * 60 * 1000);
  }
  return datas;
}
