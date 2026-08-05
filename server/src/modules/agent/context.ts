// Contexto resolvido pelo backend ANTES de qualquer chamada a Claude ou execucao de
// tool. unidadeId e igSenderId vem sempre de conversas (nunca de um parametro que o
// modelo decidiu preencher em um tool_use) - a mesma regra vale tanto para as tools
// de posse (find/modify/cancel/status) quanto para as demais, para nao depender do
// LLM em nenhuma decisao de isolamento multi-tenant.
export interface AgentContext {
  empresaId: string;
  unidadeId: string;
  igSenderId: string;
  conversaId: string;
}
