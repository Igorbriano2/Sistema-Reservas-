import { API_URL, api } from "./client.js";
import type {
  AgenteConfig,
  Bloqueio,
  Feedback,
  InstagramConnection,
  Mesa,
  MesaFormato,
  ModoConfiguracaoSalao,
  PapelUsuario,
  Permissao,
  Relatorio,
  Reserva,
  Salao,
  SalaoElemento,
  TipoElementoSalao,
  Unidade,
  Usuario,
  UsuarioComAcesso,
  WhatsappConfig,
  WhatsappConnection,
} from "../types.js";

// "identificador" aceita e-mail (dono) OU username (dono/gerente/funcionario) - ver doc 17.
export function login(identificador: string, senha: string) {
  return api.post<{ token: string; usuario: Usuario }>("/auth/login", { identificador, senha });
}

export function listarUnidades() {
  return api.get<Unidade[]>("/admin/unidades");
}

// Fluxo "adicionar unidade" (doc 17, parte 3) - owner apenas. paymentMethodId vem do
// Stripe Elements no navegador, mesmo padrao do checkout publico.
export interface DadosNovaUnidade {
  nome: string;
  endereco?: string;
  timezone?: string;
  paymentMethodId: string;
}

export function adicionarUnidade(dados: DadosNovaUnidade) {
  return api.post<Unidade>("/admin/unidades", dados);
}

export function listarSaloes(unidadeId: string) {
  return api.get<Salao[]>(`/admin/unidades/${unidadeId}/saloes`);
}

export interface DadosSalao {
  nome: string;
  modoConfiguracao?: ModoConfiguracaoSalao;
  capacidadeTotal?: number;
}

export function criarSalao(unidadeId: string, dados: DadosSalao) {
  return api.post<Salao>(`/admin/unidades/${unidadeId}/saloes`, dados);
}

export function atualizarSalao(unidadeId: string, salaoId: string, dados: Partial<DadosSalao>) {
  return api.patch<Salao>(`/admin/unidades/${unidadeId}/saloes/${salaoId}`, dados);
}

export function listarMesas(unidadeId: string) {
  return api.get<Mesa[]>(`/admin/unidades/${unidadeId}/mesas`);
}

export interface DadosMesa {
  salaoId: string;
  nome: string;
  capacidadeMin: number;
  capacidadeMax: number;
  formato?: MesaFormato;
  posX?: number;
  posY?: number;
  largura?: number;
  altura?: number;
}

export function criarMesa(unidadeId: string, dados: DadosMesa) {
  return api.post<Mesa>(`/admin/unidades/${unidadeId}/mesas`, dados);
}

export function atualizarMesa(unidadeId: string, mesaId: string, dados: Partial<DadosMesa>) {
  return api.patch<Mesa>(`/admin/unidades/${unidadeId}/mesas/${mesaId}`, dados);
}

export function excluirMesa(unidadeId: string, mesaId: string) {
  return api.delete<void>(`/admin/unidades/${unidadeId}/mesas/${mesaId}`);
}

export function listarElementosSalao(unidadeId: string) {
  return api.get<SalaoElemento[]>(`/admin/unidades/${unidadeId}/salao-elementos`);
}

export interface DadosElementoSalao {
  salaoId: string;
  tipo: TipoElementoSalao;
  nome: string;
  posX: number;
  posY: number;
  largura: number;
  altura: number;
  rotacao?: number;
  capacidade?: number;
}

export function criarElementoSalao(unidadeId: string, dados: DadosElementoSalao) {
  return api.post<SalaoElemento>(`/admin/unidades/${unidadeId}/salao-elementos`, dados);
}

export function atualizarElementoSalao(unidadeId: string, elementoId: string, dados: Partial<DadosElementoSalao>) {
  return api.patch<SalaoElemento>(`/admin/unidades/${unidadeId}/salao-elementos/${elementoId}`, dados);
}

export function excluirElementoSalao(unidadeId: string, elementoId: string) {
  return api.delete<void>(`/admin/unidades/${unidadeId}/salao-elementos/${elementoId}`);
}

// Notificacoes push (doc 15) - inscricao do proprio dispositivo/navegador pra
// receber avisos de nova reserva / cancelamento pelo chat.
export function obterChavePublicaPush(unidadeId: string) {
  return api.get<{ chavePublica: string | null }>(`/admin/unidades/${unidadeId}/push/chave-publica`);
}

export interface DadosInscricaoPush {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function inscreverPush(unidadeId: string, dados: DadosInscricaoPush) {
  return api.post<{ inscrito: boolean }>(`/admin/unidades/${unidadeId}/push`, dados);
}

export function desinscreverPush(unidadeId: string, endpoint: string) {
  return api.delete<void>(`/admin/unidades/${unidadeId}/push?endpoint=${encodeURIComponent(endpoint)}`);
}

export function listarBloqueios(unidadeId: string) {
  return api.get<Bloqueio[]>(`/admin/unidades/${unidadeId}/bloqueios`);
}

export interface DadosNovoBloqueio {
  mesaId?: string;
  salaoId?: string;
  dataInicio: string;
  dataFim: string;
  motivo: string;
}

export function criarBloqueio(unidadeId: string, dados: DadosNovoBloqueio) {
  return api.post<Bloqueio>(`/admin/unidades/${unidadeId}/bloqueios`, dados);
}

export function removerBloqueio(unidadeId: string, bloqueioId: string) {
  return api.delete<void>(`/admin/unidades/${unidadeId}/bloqueios/${bloqueioId}`);
}

export function gerarRelatorio(unidadeId: string, dataInicio: string, dataFim: string) {
  return api.get<Relatorio>(`/admin/unidades/${unidadeId}/relatorios?dataInicio=${dataInicio}&dataFim=${dataFim}`);
}

export function listarReservas(unidadeId: string, data: string) {
  return api.get<Reserva[]>(`/admin/unidades/${unidadeId}/reservations?data=${data}`);
}

// Usado pelo dashboard gerencial - lista todas as reservas do periodo (inclusive) para
// calcular metricas agregadas no proprio front, sem precisar de um endpoint dedicado.
export function listarReservasPorPeriodo(unidadeId: string, dataInicio: string, dataFim: string) {
  return api.get<Reserva[]>(
    `/admin/unidades/${unidadeId}/reservations?dataInicio=${dataInicio}&dataFim=${dataFim}`,
  );
}

export interface DadosNovaReserva {
  // Exatamente um dos dois: mesaId (salao modo "mapa") ou salaoId (modo "simples").
  mesaId?: string;
  salaoId?: string;
  data: string;
  horaInicio: string;
  horaFim?: string;
  numPessoas: number;
  clienteNome: string;
  clienteTelefone?: string;
  observacoes?: string;
}

export function criarReserva(unidadeId: string, dados: DadosNovaReserva) {
  return api.post<Reserva>(`/admin/unidades/${unidadeId}/reservations`, dados);
}

export interface DadosEditarReserva {
  mesaId?: string;
  salaoId?: string;
  data?: string;
  horaInicio?: string;
  horaFim?: string;
  numPessoas?: number;
  clienteNome?: string;
  clienteTelefone?: string;
  observacoes?: string;
  status?: Reserva["status"];
}

export function atualizarReserva(unidadeId: string, reservaId: string, dados: DadosEditarReserva) {
  return api.patch<Reserva>(`/admin/unidades/${unidadeId}/reservations/${reservaId}`, dados);
}

export function cancelarReserva(unidadeId: string, reservaId: string) {
  return api.delete<Reserva>(`/admin/unidades/${unidadeId}/reservations/${reservaId}`);
}

// Owner apenas (backend rejeita com 403 para funcionario/gerente nestas rotas).
export function listarUsuarios() {
  return api.get<UsuarioComAcesso[]>("/admin/usuarios");
}

export interface DadosNovoUsuario {
  nome: string;
  // Sem e-mail (doc 17) - gerente/funcionario logam so com username+senha,
  // definidos aqui pelo dono.
  username: string;
  senha: string;
  papel: Exclude<PapelUsuario, "owner">;
  unidadeIds: string[];
  permissoes: Permissao[];
}

export function criarUsuario(dados: DadosNovoUsuario) {
  return api.post<UsuarioComAcesso>("/admin/usuarios", dados);
}

export function obterAgenteConfig() {
  return api.get<AgenteConfig>("/admin/agente-config");
}

export function atualizarAgenteConfig(dados: Partial<Omit<AgenteConfig, "empresaId">>) {
  return api.patch<AgenteConfig>("/admin/agente-config", dados);
}

// Conexao self-service do Instagram via OAuth (doc 14) - o comando manual
// instagram:connect continua existindo em paralelo (mesmo padrao do WhatsApp).
export function obterConexaoInstagram() {
  return api.get<InstagramConnection>("/admin/instagram/connection");
}

// E uma navegacao de pagina inteira (redirect pra Meta), nao um fetch - o token de
// sessao viaja como query param so pra essa etapa (ver instagram-oauth.routes.ts).
export function urlConectarInstagram(): string {
  const token = localStorage.getItem("token") ?? "";
  return `${API_URL}/auth/instagram/connect?token=${encodeURIComponent(token)}`;
}

// WhatsApp Business (doc 16) - conexao e feita fora do painel via o comando
// whatsapp:connect (mesmo MVP manual do Instagram); aqui so mostramos o status.
export function listarConexoesWhatsapp() {
  return api.get<WhatsappConnection[]>("/admin/whatsapp/connection");
}

export function obterWhatsappConfig() {
  return api.get<WhatsappConfig>("/admin/whatsapp/config");
}

export function atualizarWhatsappConfig(dados: Partial<Omit<WhatsappConfig, "empresaId">>) {
  return api.patch<WhatsappConfig>("/admin/whatsapp/config", dados);
}

export function listarFeedbacks() {
  return api.get<Feedback[]>("/admin/whatsapp/feedbacks");
}

// Rotas publicas (pagina /reservar/:token) - sem autenticacao, protegidas pelo proprio
// token de curta duracao gerado pelo agente.
export interface InfoDoLinkDeReserva {
  unidadeNome: string;
  timezone: string;
  // Tracking de marketing do restaurante (doc 13) - nulo se o dono nao configurou.
  googleTagId: string | null;
  facebookPixelId: string | null;
}

export function obterInfoDoLinkDeReserva(token: string) {
  return api.get<InfoDoLinkDeReserva>(`/public/reservation-link/${token}`);
}

export interface DadosReservaPublica {
  data: string;
  horaInicio: string;
  numPessoas: number;
  clienteNome: string;
  clienteTelefone?: string;
  // Escolhida pelo cliente no mapa visual (doc 11 Parte 2). Se ausente, o backend
  // escolhe a mesa/salao automaticamente (fluxo antigo, ainda suportado).
  mesaId?: string;
  // Doc 16 - opcionais, so tem efeito com clienteTelefone tambem preenchido.
  dataNascimento?: string;
  whatsappOptIn?: boolean;
}

export interface ReservaPublicaCriada {
  id: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  numPessoas: number;
  status: string;
}

export function criarReservaPublica(token: string, dados: DadosReservaPublica) {
  return api.post<ReservaPublicaCriada>(`/public/reservation-link/${token}/reservations`, dados);
}

// Mapa visual do salao pra escolha de mesa pelo cliente (doc 11 Parte 2) - mesma forma
// de mesa/elemento do editor do dono, com disponivel/motivo calculados pro
// data/horaInicio/numPessoas informados.
export interface MesaPublica {
  id: string;
  salaoId: string;
  nome: string;
  capacidadeMin: number;
  capacidadeMax: number;
  formato: MesaFormato;
  posX: number | null;
  posY: number | null;
  largura: number | null;
  altura: number | null;
  disponivel: boolean;
  motivo?: string;
}

export interface ElementoPublico {
  id: string;
  salaoId: string;
  tipo: TipoElementoSalao;
  nome: string;
  posX: number;
  posY: number;
  largura: number;
  altura: number;
  rotacao: number;
  capacidade: number | null;
}

export interface SalaoPublico {
  id: string;
  nome: string;
  mesas: MesaPublica[];
  elementos: ElementoPublico[];
}

export interface RespostaMesasDisponiveis {
  disponibilidade: { disponivel: boolean; motivo?: string };
  saloes: SalaoPublico[];
}

export function listarMesasDisponiveisPublico(token: string, data: string, horaInicio: string, numPessoas: number) {
  const params = new URLSearchParams({ data, horaInicio, numPessoas: String(numPessoas) });
  return api.get<RespostaMesasDisponiveis>(`/public/reservation-link/${token}/mesas-disponiveis?${params}`);
}

// Formulario de contato/lista de espera da landing page (secao de preco) - ainda
// nao ha checkout, entao isso so registra o interesse pra contato manual depois.
export interface DadosWaitlist {
  nome: string;
  email: string;
  whatsapp: string;
  nomeRestaurante: string;
}

export function enviarInteresseWaitlist(dados: DadosWaitlist) {
  return api.post<{ id: string }>("/public/waitlist", dados);
}

// Assistente de assinatura (/assinar) - Etapa 1 (dados cadastrais).
export function verificarEmailDisponivel(email: string) {
  return api.post<{ disponivel: boolean }>("/public/checkout/validar-email", { email });
}

export function verificarUsernameDisponivel(username: string) {
  return api.post<{ disponivel: boolean }>("/public/checkout/validar-username", { username });
}

// Etapa 2 (pagamento) - paymentMethodId vem do Stripe Elements no navegador; o numero
// do cartao em si nunca passa pelo nosso backend.
export interface DadosAssinatura {
  nome: string;
  telefone: string;
  email: string;
  documento: string;
  nomeEmpresa: string;
  paymentMethodId: string;
}

export interface AssinaturaCriada {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: string;
  trialEnd: number | null;
}

export function criarAssinatura(dados: DadosAssinatura) {
  return api.post<AssinaturaCriada>("/public/checkout/assinar", dados);
}

// Etapa 3 (senha + provisionamento). Apos sucesso, o frontend chama o /auth/login
// normal (Etapa 4, login automatico) - este endpoint so cria a conta, nao devolve token.
export interface DadosCriarConta {
  nome: string;
  telefone: string;
  email: string;
  username: string;
  documento: string;
  nomeEmpresa: string;
  senha: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
}

export function criarConta(dados: DadosCriarConta) {
  return api.post<{ empresaId: string }>("/public/checkout/criar-conta", dados);
}
