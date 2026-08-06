import { plataformaApi } from "./api.js";
import type { AssinaturaStatus, Cliente, Lead, LeadStatus, PlataformaAdmin } from "./types.js";

export function plataformaLogin(email: string, senha: string) {
  return plataformaApi.post<{ token: string; admin: PlataformaAdmin }>("/plataforma/auth/login", { email, senha });
}

export function plataformaMe() {
  return plataformaApi.get<PlataformaAdmin>("/plataforma/auth/me");
}

export function listarClientes() {
  return plataformaApi.get<Cliente[]>("/plataforma/clientes");
}

export interface DadosAtualizarCliente {
  assinaturaStatus?: AssinaturaStatus;
  plano?: string;
  observacoes?: string;
}

export function atualizarCliente(empresaId: string, dados: DadosAtualizarCliente) {
  return plataformaApi.patch<Cliente>(`/plataforma/clientes/${empresaId}`, dados);
}

export function listarLeads() {
  return plataformaApi.get<Lead[]>("/plataforma/leads");
}

export function atualizarStatusDoLead(leadId: string, status: LeadStatus) {
  return plataformaApi.patch<Lead>(`/plataforma/leads/${leadId}`, { status });
}

export function converterLead(leadId: string, senha: string) {
  return plataformaApi.post<{ empresa: Cliente; lead: Lead }>(`/plataforma/leads/${leadId}/converter`, { senha });
}

export function entrarEmModoTeste() {
  return plataformaApi.post<{ token: string; usuario: { id: string; nome: string; email: string; papel: string; empresaId: string } }>(
    "/plataforma/modo-teste",
  );
}
