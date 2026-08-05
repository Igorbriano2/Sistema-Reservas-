export interface Usuario {
  id: string;
  nome: string;
  email: string;
  papel: "admin";
  empresaId: string;
}

export interface Unidade {
  id: string;
  empresaId: string;
  nome: string;
  endereco: string | null;
  timezone: string;
}

export interface Salao {
  id: string;
  unidadeId: string;
  nome: string;
}

export type MesaFormato = "redonda" | "quadrada" | "retangular";

export interface Mesa {
  id: string;
  salaoId: string;
  nome: string;
  capacidadeMin: number;
  capacidadeMax: number;
  formato: MesaFormato;
  combinavelCom: string[];
}

export type ReservaStatus = "pendente" | "confirmada" | "cancelada" | "concluida" | "no_show";
export type CanalOrigem = "instagram" | "manual";

export interface Reserva {
  id: string;
  unidadeId: string;
  mesaId: string;
  igSenderId: string | null;
  clienteNome: string;
  clienteTelefone: string | null;
  numPessoas: number;
  data: string;
  horaInicio: string;
  horaFim: string;
  status: ReservaStatus;
  observacoes: string | null;
  canalOrigem: CanalOrigem;
  criadoEm: string;
}
