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
  unidadeNome?: string;
  timezone?: string;
  plano?: string;
  ehDemo?: boolean;
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
      senhaHash,
      papel: "owner",
    })
    .returning();

  return { empresa, owner, unidade };
}
