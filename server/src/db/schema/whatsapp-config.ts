import { pgTable, uuid, text, boolean, integer } from "drizzle-orm/pg-core";
import { empresas } from "./empresas.js";

// Configuracao 1:1 por empresa das campanhas de marketing/feedback via WhatsApp
// (mesmo padrao 1 linha por empresa de agente_config).
export const whatsappConfig = pgTable("whatsapp_config", {
  empresaId: uuid("empresa_id")
    .primaryKey()
    .references(() => empresas.id, { onDelete: "cascade" }),
  feedbackAtivo: boolean("feedback_ativo").notNull().default(true),
  aniversarioAtivo: boolean("aniversario_ativo").notNull().default(true),
  recuperacaoAtivo: boolean("recuperacao_ativo").notNull().default(true),
  // Texto customizavel interpolado no corpo do template aprovado pela Meta (o nome/id
  // do template em si fica em env - ver whatsapp-templates.ts).
  textoAniversario: text("texto_aniversario"),
  textoRecuperacao: text("texto_recuperacao"),
  diasInatividadeRecuperacao: integer("dias_inatividade_recuperacao").notNull().default(60),
});

export type WhatsappConfig = typeof whatsappConfig.$inferSelect;
export type NovoWhatsappConfig = typeof whatsappConfig.$inferInsert;
