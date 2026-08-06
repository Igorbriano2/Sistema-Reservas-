import { api } from "./client.js";
import type { AgenteConfig, Mesa, MesaFormato, PapelUsuario, Reserva, Salao, Unidade, Usuario } from "../types.js";

export function login(email: string, senha: string) {
  return api.post<{ token: string; usuario: Usuario }>("/auth/login", { email, senha });
}

export function listarUnidades() {
  return api.get<Unidade[]>("/admin/unidades");
}

export function listarSaloes(unidadeId: string) {
  return api.get<Salao[]>(`/admin/unidades/${unidadeId}/saloes`);
}

export function criarSalao(unidadeId: string, nome: string) {
  return api.post<Salao>(`/admin/unidades/${unidadeId}/saloes`, { nome });
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
  mesaId: string;
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

// Owner apenas (backend rejeita com 403 para funcionario nestas rotas).
export function listarUsuarios() {
  return api.get<Usuario[]>("/admin/usuarios");
}

export interface DadosNovoUsuario {
  nome: string;
  email: string;
  senha: string;
  papel: PapelUsuario;
}

export function criarUsuario(dados: DadosNovoUsuario) {
  return api.post<Usuario>("/admin/usuarios", dados);
}

export function obterAgenteConfig() {
  return api.get<AgenteConfig>("/admin/agente-config");
}

export function atualizarAgenteConfig(dados: Partial<Omit<AgenteConfig, "empresaId">>) {
  return api.patch<AgenteConfig>("/admin/agente-config", dados);
}

// Rotas publicas (pagina /reservar/:token) - sem autenticacao, protegidas pelo proprio
// token de curta duracao gerado pelo agente.
export interface InfoDoLinkDeReserva {
  unidadeNome: string;
  timezone: string;
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
