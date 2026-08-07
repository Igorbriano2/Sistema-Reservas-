import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { agenteConfig, empresas, unidades, usuarios, type Empresa, type Unidade, type Usuario } from "../db/schema/index.js";
import { hashPassword } from "./password.js";
import { RequisicaoInvalidaError } from "./errors.js";

export interface CriarEmpresaComOwnerParams {
  nomeEmpresa: string;
  ownerNome: string;
  ownerEmail: string;
  ownerSenha: string;
  // Opcional: quando nao informado (seed/modo teste/conversao de lead, que nao tem
  // esse campo no formulario de origem), deriva um a partir do e-mail. O checkout
  // publico (unico fluxo que hoje coleta isso do usuario) sempre passa explicito.
  ownerUsername?: string;
  unidadeNome?: string;
  timezone?: string;
  plano?: string;
  ehDemo?: boolean;
}

// "joao.silva+teste@x.com" -> "joao.silva.teste" - so letras/numeros/ponto, sem @/dominio.
function derivarUsernameDoEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local.toLowerCase().replace(/[^a-z0-9.]/g, "") || "usuario";
}

async function gerarUsernameDisponivel(db: Database, base: string): Promise<string> {
  let candidato = base;
  let sufixo = 1;
  while (true) {
    const [existente] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.username, candidato)).limit(1);
    if (!existente) return candidato;
    sufixo += 1;
    candidato = `${base}${sufixo}`;
  }
}

// Cria empresa + primeira unidade + agente_config padrao + usuario owner - o "pacote
// minimo" pra uma empresa nova conseguir logar e usar o sistema. Usado pelo seed
// (npm run db:seed) e pelo painel da plataforma (conversao de lead em cliente, e
// criacao/garantia da empresa demo do "modo teste").
export async function criarEmpresaComOwner(
  db: Database,
  params: CriarEmpresaComOwnerParams,
): Promise<{ empresa: Empresa; owner: Usuario; unidade: Unidade }> {
  const emailNormalizado = params.ownerEmail.toLowerCase();
  const [existente] = await db.select().from(usuarios).where(eq(usuarios.email, emailNormalizado)).limit(1);
  if (existente) {
    throw new RequisicaoInvalidaError(`Ja existe um login com o email ${emailNormalizado}`);
  }

  // Resolve/valida o username ANTES de criar qualquer coisa (empresa/unidade/agente
  // ficariam orfaos se isso falhasse depois de ja terem sido inseridos).
  const usernameDesejado = params.ownerUsername?.trim().toLowerCase() || derivarUsernameDoEmail(emailNormalizado);
  const username = await gerarUsernameDisponivel(db, usernameDesejado);
  if (params.ownerUsername && username !== usernameDesejado) {
    throw new RequisicaoInvalidaError(`Ja existe um usuario com o nome "${usernameDesejado}"`);
  }

  const [empresa] = await db
    .insert(empresas)
    .values({
      nome: params.nomeEmpresa,
      plano: params.plano ?? "trial",
      ehDemo: params.ehDemo ?? false,
    })
    .returning();

  const [unidade] = await db
    .insert(unidades)
    .values({
      empresaId: empresa.id,
      nome: params.unidadeNome ?? "Unidade Principal",
      timezone: params.timezone ?? "America/Sao_Paulo",
    })
    .returning();

  await db.insert(agenteConfig).values({
    empresaId: empresa.id,
    nomeDoAgente: "Assistente",
    descricaoRestaurante: params.nomeEmpresa,
    saudacao: "Ola! Como posso ajudar com sua reserva?",
    despedida: "Ate breve!",
  });

  const senhaHash = await hashPassword(params.ownerSenha);
  const [owner] = await db
    .insert(usuarios)
    .values({
      empresaId: empresa.id,
      nome: params.ownerNome,
      email: emailNormalizado,
      username,
      senhaHash,
      papel: "owner",
    })
    .returning();

  return { empresa, owner, unidade };
}
