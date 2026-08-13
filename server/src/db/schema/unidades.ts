import { pgTable, uuid, text, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { empresas } from "./empresas.js";

export const unidades = pgTable(
  "unidades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    // Identificador legivel derivado do nome (ex: "Cervegela Londrina" -> "cervegela-
    // londrina"), usado no link publico do cardapio (/cardapio/:slug) no lugar do uuid
    // cru - unico GLOBALMENTE (nao so por empresa), porque a URL publica nao carrega
    // nenhum outro identificador da empresa. Gerado automaticamente na criacao da
    // unidade (ver gerarSlugDisponivel em lib/empresas.ts), nunca escolhido a mao.
    slug: text("slug").notNull(),
    endereco: text("endereco"),
    telefone: text("telefone"),
    // Contato de urgencia (doc 27) - ex: telefone do gerente. Diferente do "telefone"
    // acima (linha geral da loja): usado quando o agente escala pra humano (tool
    // escalate_to_human) e quer dar ao cliente um jeito imediato de resolver algo
    // urgente, em vez de so deixar ele esperando alguem ver o painel.
    contatoUrgenciaNome: text("contato_urgencia_nome"),
    contatoUrgenciaTelefone: text("contato_urgencia_telefone"),
    // Lista de redes sociais: [{ "rede": "Instagram", "link": "https://instagram.com/..." }, ...]
    // - obrigatoria pro agente de IA responder com precisao quando o cliente perguntar
    // (ver montarSystemPrompt em lib/agent-prompt.ts).
    redesSociais: jsonb("redes_sociais").notNull().default([]),
    // Timezone IANA, ex: "America/Sao_Paulo". Cada unidade pode estar em fuso diferente.
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  },
  (table) => [index("unidades_empresa_id_idx").on(table.empresaId), uniqueIndex("unidades_slug_idx").on(table.slug)],
);

export type Unidade = typeof unidades.$inferSelect;
export type NovaUnidade = typeof unidades.$inferInsert;
