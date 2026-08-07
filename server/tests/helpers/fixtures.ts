import { db } from "../../src/db/client.js";
import {
  agenteConfig,
  assinaturas,
  clientes,
  conversas,
  instagramConnections,
  mesas,
  regrasHorario,
  saloes,
  whatsappConnections,
  type Assinatura,
} from "../../src/db/schema/index.js";
import { encrypt } from "../../src/lib/crypto.js";
import { criarReserva } from "../../src/lib/reservations.js";

// Default "mapa" (nao "simples", que e o default da propria tabela): a maioria dos
// testes existentes cadastra mesas manualmente e espera o comportamento classico de
// mesa-por-mesa, entao o fixture fixa isso explicitamente pra nao depender do default
// do schema (que e pensado para o fluxo real de um dono novo, nao para os testes).
export async function criarSalao(
  unidadeId: string,
  nome = "Salao Principal",
  overrides: Partial<{ modoConfiguracao: "simples" | "mapa"; capacidadeTotal: number }> = {},
) {
  const [salao] = await db
    .insert(saloes)
    .values({
      unidadeId,
      nome,
      modoConfiguracao: overrides.modoConfiguracao ?? "mapa",
      capacidadeTotal: overrides.capacidadeTotal,
    })
    .returning();
  return salao;
}

export async function criarSalaoSimples(unidadeId: string, capacidadeTotal: number, nome = "Salao Simples") {
  const [salao] = await db
    .insert(saloes)
    .values({ unidadeId, nome, modoConfiguracao: "simples", capacidadeTotal })
    .returning();
  return salao;
}

export async function criarMesa(
  salaoId: string,
  overrides: Partial<{ nome: string; capacidadeMin: number; capacidadeMax: number }> = {},
) {
  const [mesa] = await db
    .insert(mesas)
    .values({
      salaoId,
      nome: overrides.nome ?? "Mesa 1",
      capacidadeMin: overrides.capacidadeMin ?? 1,
      capacidadeMax: overrides.capacidadeMax ?? 4,
    })
    .returning();
  return mesa;
}

// Regra de horario cobrindo todos os dias da semana, das 11:00 as 23:00.
export async function criarRegraHorarioTodosOsDias(
  unidadeId: string,
  overrides: Partial<{ duracaoPadraoMin: number; bufferMin: number; horaAbertura: string; horaFechamento: string }> = {},
) {
  const regras = [];
  for (let dia = 0; dia <= 6; dia++) {
    const [regra] = await db
      .insert(regrasHorario)
      .values({
        unidadeId,
        diaSemana: dia,
        horaAbertura: overrides.horaAbertura ?? "11:00",
        horaFechamento: overrides.horaFechamento ?? "23:00",
        duracaoPadraoMin: overrides.duracaoPadraoMin ?? 90,
        bufferMin: overrides.bufferMin ?? 0,
      })
      .returning();
    regras.push(regra);
  }
  return regras;
}

export async function criarConversa(empresaId: string, unidadeId: string, igSenderId: string) {
  const [conversa] = await db
    .insert(conversas)
    .values({ empresaId, unidadeId, igSenderId })
    .returning();
  return conversa;
}

// Conexao compartilhada + empresa com mais de uma unidade (doc 17, parte 4) - a
// conversa nasce sem unidade ainda resolvida.
export async function criarConversaPendente(empresaId: string, igSenderId: string) {
  const [conversa] = await db
    .insert(conversas)
    .values({ empresaId, unidadeId: null, igSenderId })
    .returning();
  return conversa;
}

export async function criarAgenteConfig(empresaId: string, overrides: Partial<{ nomeDoAgente: string }> = {}) {
  const [config] = await db
    .insert(agenteConfig)
    .values({
      empresaId,
      nomeDoAgente: overrides.nomeDoAgente ?? "Assistente Teste",
      descricaoRestaurante: "Restaurante de teste",
      saudacao: "Ola!",
      despedida: "Ate mais!",
    })
    .returning();
  return config;
}

// Cria uma reserva direto pela lib (sem passar pelo agente) - usada nos testes que
// precisam de uma reserva pre-existente pra testar find/modify/cancel/status, ja que
// o agente nao tem mais nenhuma tool capaz de criar reserva.
export async function criarReservaDireta(
  unidadeId: string,
  mesaId: string,
  igSenderId: string,
  overrides: Partial<{ data: string; horaInicio: string; numPessoas: number; clienteNome: string }> = {},
) {
  return criarReserva(db, {
    unidadeId,
    mesaId,
    igSenderId,
    data: overrides.data ?? "2026-10-10",
    horaInicio: overrides.horaInicio ?? "19:00",
    numPessoas: overrides.numPessoas ?? 2,
    clienteNome: overrides.clienteNome ?? "Cliente Teste",
    canalOrigem: "instagram",
  });
}

export async function criarConexaoInstagram(
  empresaId: string,
  unidadeId: string | null,
  igBusinessAccountId: string,
  tokenPlano = "token-de-teste-do-instagram",
) {
  const chave = process.env.TOKEN_ENCRYPTION_KEY!;
  const [conexao] = await db
    .insert(instagramConnections)
    .values({
      empresaId,
      unidadeId,
      igBusinessAccountId,
      accessTokenEncrypted: encrypt(tokenPlano, chave),
      status: "ativo",
    })
    .returning();
  return conexao;
}

export async function criarConexaoWhatsapp(
  empresaId: string,
  unidadeId: string | null,
  wabaId = "waba-teste",
  phoneNumberId = "phone-number-id-teste",
  tokenPlano = "token-de-teste-do-whatsapp",
) {
  const chave = process.env.TOKEN_ENCRYPTION_KEY!;
  const [conexao] = await db
    .insert(whatsappConnections)
    .values({
      empresaId,
      unidadeId,
      wabaId,
      phoneNumberId,
      accessTokenEncrypted: encrypt(tokenPlano, chave),
      status: "ativo",
    })
    .returning();
  return conexao;
}

export async function criarCliente(
  empresaId: string,
  telefone: string,
  overrides: Partial<{ nome: string; dataNascimento: string; whatsappOptIn: boolean; whatsappOptInEm: Date }> = {},
) {
  const [cliente] = await db
    .insert(clientes)
    .values({
      empresaId,
      telefone,
      nome: overrides.nome ?? "Cliente Teste",
      dataNascimento: overrides.dataNascimento,
      whatsappOptIn: overrides.whatsappOptIn ?? false,
      whatsappOptInEm: overrides.whatsappOptInEm,
    })
    .returning();
  return cliente;
}

export async function criarAssinatura(
  empresaId: string,
  unidadeId: string,
  overrides: Partial<{
    status: Assinatura["status"];
    subscriptionIdGateway: string;
    customerIdGateway: string;
    atrasadaDesde: Date | null;
  }> = {},
) {
  const [assinatura] = await db
    .insert(assinaturas)
    .values({
      empresaId,
      unidadeId,
      gateway: "stripe",
      customerIdGateway: overrides.customerIdGateway ?? "cus_teste",
      subscriptionIdGateway: overrides.subscriptionIdGateway ?? `sub_teste_${empresaId}`,
      status: overrides.status ?? "trialing",
      atrasadaDesde: overrides.atrasadaDesde,
    })
    .returning();
  return assinatura;
}
