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

// NPS customizavel (doc 21) - perguntas que substituem a pesquisa fixa de nota+
// comentario livre quando a empresa configura pelo menos uma.
export type PesquisaPerguntaTipo = "escala" | "texto_curto";

export interface PesquisaPergunta {
  id: string;
  empresaId: string;
  ordem: number;
  tipo: PesquisaPerguntaTipo;
  texto: string;
  ativa: boolean;
}

export interface PesquisaRespostaCustomizada {
  perguntaTexto: string;
  valorEscala: number | null;
  valorTexto: string | null;
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
  respostasCustomizadas: PesquisaRespostaCustomizada[];
}

export interface RedeSocial {
  rede: string;
  link: string;
}

export interface Unidade {
  id: string;
  empresaId: string;
  nome: string;
  // Usado no link publico do cardapio (/cardapio/:slug) no lugar do uuid cru - gerado
  // automaticamente a partir do nome, nunca editavel.
  slug: string;
  endereco: string | null;
  // Dados obrigatorios pro agente de IA responder com precisao quando o cliente
  // perguntar (doc 24) - nunca inventados, sempre vindos daqui.
  telefone: string | null;
  // Contato de urgencia (doc 27) - ex: telefone do gerente, usado pelo agente quando
  // escala uma conversa pra humano, pra dar ao cliente um jeito imediato de resolver
  // algo urgente. Diferente do telefone geral acima.
  contatoUrgenciaNome: string | null;
  contatoUrgenciaTelefone: string | null;
  redesSociais: RedeSocial[];
  timezone: string;
  // So vem preenchido pra gerente/funcionario (owner tem acesso implicito a tudo,
  // backend nem inclui o campo) - funcionalidades extra liberadas nessa loja (doc 17).
  permissoesExtra?: Permissao[] | null;
}

export type ModoConfiguracaoSalao = "simples" | "mapa";

// Doc 29 - horario de reserva proprio do salao, alem do turno da unidade. "turno"
// (padrao) so usa a janela do turno; "fixo"/"intervalo" restringem so ESTE salao.
export type ModoHorarioReservaSalao = "turno" | "fixo" | "intervalo";

export interface Salao {
  id: string;
  unidadeId: string;
  nome: string;
  modoConfiguracao: ModoConfiguracaoSalao;
  capacidadeTotal: number | null;
  modoHorarioReserva: ModoHorarioReservaSalao;
  horariosFixos: string[] | null;
  intervaloInicio: string | null;
  intervaloFim: string | null;
  // Doc 30 - salao de campanha (ex: "Dia dos Namorados"): so existe pra reserva nessa
  // data. Nulo (padrao) = salao permanente, disponivel todos os dias.
  dataEspecifica: string | null;
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

// Turno de funcionamento (doc 19) - varias linhas no mesmo dia da semana permitem
// turnos multiplos (ex: almoco e jantar), cada um com sua propria antecedencia
// minima e desconto informativo.
export interface RegraHorario {
  id: string;
  unidadeId: string;
  diaSemana: number; // 0 = domingo ... 6 = sabado
  nome: string | null;
  horaAbertura: string;
  horaFechamento: string;
  duracaoPadraoMin: number;
  bufferMin: number;
  antecedenciaMinMin: number;
  descontoPercentual: number | null;
  // Reserva com cobranca (doc 22) - deposito via Stripe exigido pra confirmar reserva
  // PUBLICA nesse turno (reserva manual pelo painel nunca exige).
  exigeDeposito: boolean;
  valorDepositoCentavos: number | null;
  // Horarios fixos (doc 28) - quando preenchido, a reserva PUBLICA (link do agente,
  // widget) so aceita esses horarios de inicio (ex.: ["19:00"]). Vazio/nulo = qualquer
  // horario dentro da janela abertura/fechamento.
  horariosFixos: string[] | null;
}

// Feriado/data especial (doc 26) - fechamento pontual, horario excepcional e/ou (o
// caso mais comum) uma data que passa a contar como feriado municipal no calculo do
// valor do rodizio (ver check_rodizio_price), mesmo continuando aberta normalmente.
export interface ExcecaoHorario {
  id: string;
  unidadeId: string;
  data: string;
  nome: string | null;
  fechado: boolean;
  horaAbertura: string | null;
  horaFechamento: string | null;
}

// Thread de conversa do Instagram (doc 26 - antes so existia a API, sem tela pra ver
// as conversas escaladas/pausadas pelo agente).
export interface Conversa {
  id: string;
  empresaId: string;
  unidadeId: string | null;
  igSenderId: string;
  agentPaused: boolean;
  ultimaAtividadeHumanaEm: string | null;
  nomeCliente: string | null;
  fotoClienteUrl: string | null;
  ultimaMensagem: string | null;
  ultimaMensagemEm: string | null;
}

export interface Mensagem {
  id: string;
  conversaId: string;
  papel: "user" | "assistant";
  conteudo: string;
  enviadoPorHumano: boolean;
  criadoEm: string;
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
export type CanalOrigem = "instagram" | "manual" | "widget";
// Doc 22 - "pendente" nunca fica persistido de fato (a reserva so nasce depois do
// deposito confirmado); existe pro tipo cobrir o estado transitorio do fluxo.
export type StatusPagamento = "nao_exigido" | "pendente" | "pago" | "reembolsado";

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
  statusPagamento: StatusPagamento;
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

// Fila de espera de walk-in (doc 20) - cliente que chegou sem reserva e esta
// esperando mesa vagar. Diferente do formulario de interesse da landing page.
export type FilaEsperaStatus = "esperando" | "chamado" | "sentado" | "desistiu";

export interface FilaEsperaEntrada {
  id: string;
  unidadeId: string;
  clienteNome: string;
  clienteTelefone: string | null;
  numPessoas: number;
  status: FilaEsperaStatus;
  observacoes: string | null;
  criadoEm: string;
  chamadoEm: string | null;
  finalizadoEm: string | null;
}

export interface Relatorio {
  periodo: { dataInicio: string; dataFim: string };
  ocupacao: { capacidadeSlots: number; reservasOcupando: number; taxa: number | null };
  naoComparecimento: { totalReservas: number; totalNaoCompareceu: number; taxa: number | null };
  mesasMaisPedidas: Array<{ mesaId: string; mesaNome: string; totalReservas: number }>;
}
