import { pgTable, uuid, text, jsonb } from "drizzle-orm/pg-core";
import { empresas } from "./empresas.js";

// Configuracao 1:1 por empresa (define o system prompt / comportamento do agente Claude).
export const agenteConfig = pgTable("agente_config", {
  empresaId: uuid("empresa_id")
    .primaryKey()
    .references(() => empresas.id, { onDelete: "cascade" }),
  nomeDoAgente: text("nome_do_agente").notNull().default("Assistente"),
  descricaoRestaurante: text("descricao_restaurante").notNull().default(""),
  tomDeVoz: text("tom_de_voz").notNull().default("cordial e objetivo"),
  saudacao: text("saudacao").notNull().default(""),
  despedida: text("despedida").notNull().default(""),
  politicasReserva: text("politicas_reserva").notNull().default(""),
  // Lista de perguntas/respostas: [{ "pergunta": "...", "resposta": "..." }]
  faq: jsonb("faq").notNull().default([]),
  // Lista de topicos que o agente deve evitar/escalar: ["politica", "reclamacoes juridicas", ...]
  topicosProibidos: jsonb("topicos_proibidos").notNull().default([]),
});

export type AgenteConfig = typeof agenteConfig.$inferSelect;
export type NovaAgenteConfig = typeof agenteConfig.$inferInsert;
