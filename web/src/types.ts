export type PapelUsuario = "owner" | "funcionario";

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  papel: PapelUsuario;
  empresaId: string;
}

export interface AgenteConfig {
  empresaId: string;
  nomeDoAgente: string;
  descricaoRestaurante: string;
  tomDeVoz: string;
  saudacao: string;
  despedida: string;
  politicasReserva: string;
  faq: Array<{ pergunta: string; resposta: string }>;
  topicosProibidos: string[];
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

export interface Bloqueio {
  id: string;
  unidadeId: string;
  mesaId: string | null;
  salaoId: string | null;
  dataInicio: string;
  dataFim: string;
  motivo: string;
  criadoEm: string;
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

export interface Relatorio {
  periodo: { dataInicio: string; dataFim: string };
  ocupacao: { capacidadeSlots: number; reservasOcupando: number; taxa: number | null };
  naoComparecimento: { totalReservas: number; totalNaoCompareceu: number; taxa: number | null };
  mesasMaisPedidas: Array<{ mesaId: string; mesaNome: string; totalReservas: number }>;
}
