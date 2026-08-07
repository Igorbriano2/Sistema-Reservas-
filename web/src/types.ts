export type PapelUsuario = "owner" | "gerente" | "funcionario";

export interface Usuario {
  id: string;
  nome: string;
  // Dono sempre tem e-mail; gerente/funcionario so tem username (doc 17).
  email: string | null;
  username: string | null;
  papel: PapelUsuario;
  empresaId: string;
}

// Funcionalidades "configuraveis" que o dono liga/desliga por login na hora de criar
// gerente/funcionario (ver doc 17) - reservas do dia (ver/criar/editar/cancelar,
// marcar sentada/no-show) sao sempre liberadas, sem entrar nesta lista.
export const PERMISSOES_DISPONIVEIS = [
  { valor: "editar_salao", rotulo: "Editar salão e mesas" },
  { valor: "ver_relatorios", rotulo: "Ver relatórios" },
  { valor: "editar_agente", rotulo: "Editar configurações do agente" },
  { valor: "criar_usuarios", rotulo: "Criar e gerenciar usuários" },
  { valor: "editar_cardapio", rotulo: "Editar cardápio" },
] as const;

export type Permissao = (typeof PERMISSOES_DISPONIVEIS)[number]["valor"];

export interface UsuarioComAcesso extends Usuario {
  unidades: Array<{ id: string; nome: string }>;
  permissoes: Permissao[];
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

export interface InstagramConnection {
  conectado: boolean;
  id?: string;
  igBusinessAccountId?: string;
  handle?: string | null;
  status?: "ativo" | "inativo" | "expirada";
}

export interface WhatsappConnection {
  id: string;
  unidadeId: string | null;
  wabaId: string;
  phoneNumberId: string;
  status: "ativo" | "inativo";
  conectadoEm: string;
}

export interface WhatsappConfig {
  empresaId: string;
  feedbackAtivo: boolean;
  aniversarioAtivo: boolean;
  recuperacaoAtivo: boolean;
  textoAniversario: string | null;
  textoRecuperacao: string | null;
  diasInatividadeRecuperacao: number;
}

export interface Feedback {
  id: string;
  reservaId: string;
  clienteTelefone: string;
  nota: number | null;
  comentarioTexto: string | null;
  recebidoEm: string;
  clienteNome: string;
  reservaData: string;
  reservaHoraInicio: string;
  unidadeNome: string;
}

export interface Unidade {
  id: string;
  empresaId: string;
  nome: string;
  endereco: string | null;
  timezone: string;
  // So vem preenchido pra gerente/funcionario (owner tem acesso implicito a tudo,
  // backend nem inclui o campo) - funcionalidades extra liberadas nessa loja (doc 17).
  permissoesExtra?: Permissao[] | null;
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

export interface CardapioItem {
  id: string;
  categoriaId: string;
  nome: string;
  descricao: string | null;
  precoCentavos: number;
  imagemUrl: string | null;
  porcaoServePessoas: number | null;
  somenteMaiorIdade: boolean;
  tags: string[] | null;
  ordem: number;
  ativo: boolean;
}

export interface CardapioCategoria {
  id: string;
  unidadeId: string;
  nome: string;
  ordem: number;
  ativo: boolean;
  itens: CardapioItem[];
}

export interface Relatorio {
  periodo: { dataInicio: string; dataFim: string };
  ocupacao: { capacidadeSlots: number; reservasOcupando: number; taxa: number | null };
  naoComparecimento: { totalReservas: number; totalNaoCompareceu: number; taxa: number | null };
  mesasMaisPedidas: Array<{ mesaId: string; mesaNome: string; totalReservas: number }>;
}
