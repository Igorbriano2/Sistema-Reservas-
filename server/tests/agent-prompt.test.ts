import { describe, expect, it } from "vitest";
import { montarSystemPrompt } from "../src/lib/agent-prompt.js";
import type { AgenteConfig, Unidade } from "../src/db/schema/index.js";

const CONFIG_BASE: AgenteConfig = {
  empresaId: "empresa-1",
  nomeDoAgente: "Bia",
  descricaoRestaurante: "Um restaurante italiano",
  tomDeVoz: "cordial e objetivo",
  saudacao: "Ola!",
  despedida: "Ate breve!",
  politicasReserva: "",
  faq: [],
  topicosProibidos: [],
  googleTagId: null,
  facebookPixelId: null,
};

const UNIDADE_BASE: Pick<Unidade, "nome" | "timezone" | "endereco" | "telefone" | "redesSociais"> = {
  nome: "Restaurante Teste",
  timezone: "America/Sao_Paulo",
  endereco: "Rua das Flores, 123",
  telefone: "(11) 91234-5678",
  redesSociais: [{ rede: "Instagram", link: "https://instagram.com/restauranteteste" }],
};

describe("lib/agent-prompt montarSystemPrompt (doc 24 - agente master)", () => {
  it("inclui as regras fixas do master (humano, so dados reais, admite quando nao sabe)", () => {
    const prompt = montarSystemPrompt(CONFIG_BASE, UNIDADE_BASE);
    expect(prompt).toContain("Fale como uma pessoa de verdade da equipe");
    expect(prompt).toContain("NUNCA invente endereco, telefone, prato, preco");
    expect(prompt).toContain("nao sabe responder isso porque e um atendimento automatico (uma IA)");
  });

  it("exige tentar as tools relevantes ANTES de admitir que nao sabe ou escalar pra humano", () => {
    const prompt = montarSystemPrompt(CONFIG_BASE, UNIDADE_BASE);
    expect(prompt).toContain("OBRIGADO a primeiro tentar todas as tools relevantes");
    expect(prompt).toContain("nunca escale ou admita que nao sabe SEM antes ter consultado a tool");
  });

  it("injeta endereco, telefone e redes sociais da unidade", () => {
    const prompt = montarSystemPrompt(CONFIG_BASE, UNIDADE_BASE);
    expect(prompt).toContain("Endereco: Rua das Flores, 123");
    expect(prompt).toContain("Telefone: (11) 91234-5678");
    expect(prompt).toContain("Instagram: https://instagram.com/restauranteteste");
  });

  it("nao quebra quando endereco/telefone/redes sociais estao vazios", () => {
    const unidadeSemDados = { ...UNIDADE_BASE, endereco: null, telefone: null, redesSociais: [] };
    const prompt = montarSystemPrompt(CONFIG_BASE, unidadeSemDados);
    expect(prompt).not.toContain("Dados do restaurante");
    expect(prompt).toContain("Fale como uma pessoa de verdade da equipe");
  });

  it("menciona Instagram e WhatsApp como canais atendidos", () => {
    const prompt = montarSystemPrompt(CONFIG_BASE, UNIDADE_BASE);
    expect(prompt).toContain("Instagram Direct e WhatsApp");
  });
});
