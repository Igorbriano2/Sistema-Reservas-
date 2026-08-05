import { api } from "./client.js";
import type { Mesa, MesaFormato, Reserva, Salao, Unidade, Usuario } from "../types.js";

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
