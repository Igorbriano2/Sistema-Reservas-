import { describe, expect, it } from "vitest";
import { montarSystemPrompt, montarSystemPromptResolucaoUnidade } from "../src/lib/agent-prompt.js";
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
    const prompt = montarSystemPrompt(CONFIG_BASE, UNIDADE_BASE).cacheavel;
    expect(prompt).toContain("Fale como uma pessoa de verdade da equipe");
    expect(prompt).toContain("NUNCA invente endereco, telefone, prato, preco");
    expect(prompt).toContain("nao sabe responder isso porque e um atendimento automatico (uma IA)");
  });

  it("exige tentar as tools relevantes ANTES de admitir que nao sabe ou escalar pra humano", () => {
    const prompt = montarSystemPrompt(CONFIG_BASE, UNIDADE_BASE).cacheavel;
    expect(prompt).toContain("OBRIGADO a primeiro tentar todas as tools relevantes");
    expect(prompt).toContain("nunca escale ou admita que nao sabe SEM antes ter consultado a tool");
  });

  it("injeta endereco, telefone e redes sociais da unidade", () => {
    const prompt = montarSystemPrompt(CONFIG_BASE, UNIDADE_BASE).cacheavel;
    expect(prompt).toContain("Endereco: Rua das Flores, 123");
    expect(prompt).toContain("Telefone: (11) 91234-5678");
    expect(prompt).toContain("Instagram: https://instagram.com/restauranteteste");
  });

  it("nao quebra quando endereco/telefone/redes sociais estao vazios", () => {
    const unidadeSemDados = { ...UNIDADE_BASE, endereco: null, telefone: null, redesSociais: [] };
    const prompt = montarSystemPrompt(CONFIG_BASE, unidadeSemDados).cacheavel;
    expect(prompt).not.toContain("Dados do restaurante");
    expect(prompt).toContain("Fale como uma pessoa de verdade da equipe");
  });

  it("menciona Instagram e WhatsApp como canais atendidos", () => {
    const prompt = montarSystemPrompt(CONFIG_BASE, UNIDADE_BASE).cacheavel;
    expect(prompt).toContain("Instagram Direct e WhatsApp");
  });

  it("exige confirmar nome/telefone de quem reservou e pedir confirmacao explicita antes de alterar/cancelar", () => {
    const prompt = montarSystemPrompt(CONFIG_BASE, UNIDADE_BASE).cacheavel;
    expect(prompt).toContain("peca o nome e o telefone de");
    expect(prompt).toContain("confira se o cliente_nome devolvido bate com o que a pessoa te disse");
    expect(prompt).toContain("confirmacao explicita da propria alteracao/cancelamento");
    expect(prompt).toContain("Nunca altere ou cancele");
  });

  it("exige checar disponibilidade de verdade antes de reserva nova ou alteracao, explicando o motivo e a alternativa de ir direto ao restaurante", () => {
    const prompt = montarSystemPrompt(CONFIG_BASE, UNIDADE_BASE).cacheavel;
    expect(prompt).toContain("SEMPRE use check_availability");
    expect(prompt).toContain("nunca garanta um horario sem checar antes");
    expect(prompt).toContain("inclusive quando o");
    expect(prompt).toContain("pedido e pra menos de 3h de antecedencia");
    expect(prompt).toContain("ele pode ir direto ao restaurante sem reserva como alternativa");
    expect(prompt).toContain("use check_availability para o valor NOVO antes de");
    expect(prompt).toContain("NAO chame modify_my_reservation");
    expect(prompt).toContain("inclusive quando faltam menos de 3h para o novo horario pedido");
  });

  it("exige usar a tool get_horario_funcionamento para perguntas sobre horario de funcionamento, em vez de responder direto ou inventar", () => {
    const prompt = montarSystemPrompt(CONFIG_BASE, UNIDADE_BASE).cacheavel;
    expect(prompt).toContain("use SEMPRE a tool get_horario_funcionamento");
    expect(prompt).toContain("isso NAO esta nos dados do restaurante acima");
    expect(prompt).not.toMatch(/horario de funcionamento, endereco/);
  });

  // Doc 39 - achado de auditoria de custo: a data/hora atual (muda a cada minuto)
  // NUNCA pode entrar no bloco cacheavel, senao invalida o cache de prompt em quase
  // toda chamada real (turnos da mesma conversa quase sempre ficam minutos afastados).
  it("mantem a data/hora atual FORA do bloco cacheavel (vai so no bloco volatil, sem cache_control)", () => {
    const { cacheavel, volatil } = montarSystemPrompt(CONFIG_BASE, UNIDADE_BASE);
    expect(cacheavel).not.toContain("Data e hora atual");
    expect(volatil).toContain("Data e hora atual");
    expect(volatil).toContain("America/Sao_Paulo");
  });

  // Achado real de producao (doc 40): o agente chamou uma data explicita pedida pelo
  // cliente ("14/08") de "hoje" na resposta, porque essa data com o ano atual ja
  // tinha passado. Regressao especifica pra essa falha.
  it("inclui a data atual em ISO e instrui a nunca confundir uma data explicita pedida pelo cliente com 'hoje'", () => {
    const { volatil } = montarSystemPrompt(CONFIG_BASE, UNIDADE_BASE);
    expect(volatil).toMatch(/formato ISO: \d{4}-\d{2}-\d{2}/);
    expect(volatil).toContain("dia/mes (nunca mes/dia");
    expect(volatil).toContain("PROXIMO ano em que ela cai");
    expect(volatil).toContain("NUNCA chame (nem chame de) a data que o cliente pediu de \"hoje\"");
  });
});

describe("lib/agent-prompt montarSystemPromptResolucaoUnidade (doc 17, parte 4)", () => {
  const UNIDADES = [
    { id: "id-londrina", nome: "Cervegela Londrina" },
    { id: "id-maringa", nome: "Cervegela Maringa" },
  ];

  it("instrui a nunca repetir a pergunta quando a resposta ja aponta claramente pra uma unidade da lista", () => {
    const prompt = montarSystemPromptResolucaoUnidade({ nomeDoAgente: "Bia" }, UNIDADES).cacheavel;
    expect(prompt).toContain("QUALQUER resposta");
    expect(prompt).toContain("mesmo sozinha, so uma palavra");
    expect(prompt).toContain("chame resolver_unidade_da_conversa IMEDIATAMENTE");
    expect(prompt).toContain("nunca repita a mesma");
  });

  it("lista as unidades disponiveis com seus ids", () => {
    const prompt = montarSystemPromptResolucaoUnidade({ nomeDoAgente: "Bia" }, UNIDADES).cacheavel;
    expect(prompt).toContain("Cervegela Londrina (id: id-londrina)");
    expect(prompt).toContain("Cervegela Maringa (id: id-maringa)");
  });

  it("nao tem componente volatil (nada que mude entre chamadas da mesma empresa)", () => {
    const { volatil } = montarSystemPromptResolucaoUnidade({ nomeDoAgente: "Bia" }, UNIDADES);
    expect(volatil).toBe("");
  });
});
