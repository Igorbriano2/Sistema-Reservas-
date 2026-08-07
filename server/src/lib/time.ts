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

// Data/hora "agora" no fuso da unidade, como data (YYYY-MM-DD) + minutos desde
// 00:00 - usado pra checar antecedencia minima (doc 19) sem depender de biblioteca
// de fuso horario: usamos Intl pra ler os componentes locais e comparamos como
// numeros simples (mesma tecnica do resto do arquivo).
export function agoraNoFuso(timezone: string): { data: string; minutos: number } {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)!.value;
  return {
    data: `${valor("year")}-${valor("month")}-${valor("day")}`,
    minutos: Number(valor("hour")) * 60 + Number(valor("minute")),
  };
}

// Quantos minutos faltam (a partir de "agora" no fuso da unidade) ate a data/hora de
// uma reserva. Negativo = o horario ja passou.
export function minutosAteReserva(data: string, horaInicio: string, timezone: string): number {
  const agora = agoraNoFuso(timezone);
  const diasDeDiferenca =
    (new Date(`${data}T00:00:00Z`).getTime() - new Date(`${agora.data}T00:00:00Z`).getTime()) / 86_400_000;
  return diasDeDiferenca * 1440 + paraMinutos(horaInicio) - agora.minutos;
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
