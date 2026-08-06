import { pgTable, uuid, text, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";

// Status manual da assinatura, atualizado a mao pelo painel da plataforma - ainda nao
// ha cobranca automatica integrada (ver waitlist_leads e o painel /plataforma).
export const assinaturaStatusEnum = pgEnum("assinatura_status", ["em_teste", "ativo", "cancelado", "suspenso"]);

export const empresas = pgTable("empresas", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  plano: text("plano").notNull().default("trial"),
  assinaturaStatus: assinaturaStatusEnum("assinatura_status").notNull().default("em_teste"),
  observacoes: text("observacoes"),
  // Empresa sandbox usada pelo "modo teste" do painel da plataforma - nunca aparece
  // na listagem de clientes reais.
  ehDemo: boolean("eh_demo").notNull().default(false),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export type Empresa = typeof empresas.$inferSelect;
export type NovaEmpresa = typeof empresas.$inferInsert;
