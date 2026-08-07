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
  // Tracking de marketing do proprio restaurante (doc 13) - disparado na pagina
  // publica de reserva. Nulo ate o dono colar o id.
  googleTagId: string | null;
  facebookPixelId: string | null;
}

export interface Unidade {
  id: string;
  empresaId: string;
  nome: string;
  endereco: string | null;
  timezone: string;
}

export type ModoConfiguracaoSalao = "simples" | "mapa";

export interface Salao {
  id: string;
  unidadeId: string;
  nome: string;
  modoConfiguracao: ModoConfiguracaoSalao;
  capacidadeTotal: number | null;
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
  // Posicao/tamanho no editor visual (doc 11) - nulo ate ser posicionada pela primeira vez.
  posX: number | null;
  posY: number | null;
  largura: number | null;
  altura: number | null;
}

// Objetos decorativos/estruturais do editor visual do salao (doc 11) - nao sao
// reservaveis, so compoem o desenho (parede, porta, janela, planta, balcao/bar,
// banheiro, cozinha, cadeira avulsa).
export type TipoElementoSalao =
  | "parede"
  | "porta"
  | "janela"
  | "planta"
  | "balcao"
  | "banheiro"
  | "cozinha"
  | "cadeira";

export interface SalaoElemento {
  id: string;
  salaoId: string;
  tipo: TipoElementoSalao;
  nome: string;
  posX: number;
  posY: number;
  largura: number;
  altura: number;
  rotacao: number;
  // So usado por "balcao" (numero de banquetas exibidas no desenho).
  capacidade: number | null;
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
  // Exatamente um dos dois: mesaId (salao modo "mapa") ou salaoId (modo "simples").
  mesaId: string | null;
  salaoId: string | null;
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
