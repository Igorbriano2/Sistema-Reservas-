export interface PlataformaAdmin {
  id: string;
  nome: string;
  email: string;
}

export type AssinaturaStatus = "em_teste" | "ativo" | "cancelado" | "suspenso";

export interface Cliente {
  id: string;
  nome: string;
  plano: string;
  assinaturaStatus: AssinaturaStatus;
  observacoes: string | null;
  ehDemo: boolean;
  criadoEm: string;
  contato: { nome: string; email: string } | null;
}

export type LeadStatus = "novo" | "contatado" | "convertido" | "descartado";

export interface Lead {
  id: string;
  nome: string;
  email: string;
  whatsapp: string;
  nomeRestaurante: string;
  status: LeadStatus;
  convertidoEmpresaId: string | null;
  criadoEm: string;
}
