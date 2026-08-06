import { sql } from "drizzle-orm";
import { db, pool } from "../../src/db/client.js";
import { empresas, unidades, usuarios } from "../../src/db/schema/index.js";
import { hashPassword } from "../../src/lib/password.js";

export async function truncateAll(): Promise<void> {
  // CASCADE arrasta todas as tabelas dependentes (unidades, usuarios, mesas,
  // reservas, conversas, etc.), entao truncar empresas basta para limpar quase tudo.
  // plataforma_admins e waitlist_leads ficam de fora da cascata de proposito (nao tem
  // FK pra empresas - sao independentes de qualquer restaurante), entao precisam ser
  // truncadas explicitamente aqui tambem.
  await db.execute(sql`TRUNCATE TABLE empresas, plataforma_admins, waitlist_leads RESTART IDENTITY CASCADE`);
}

export async function closeDb(): Promise<void> {
  await pool.end();
}

interface FixtureEmpresaOptions {
  nomeEmpresa?: string;
  emailAdmin?: string;
  senhaAdmin?: string;
}

// Nome mantido "ComAdmin" por compatibilidade com os testes existentes, mas o
// usuario criado tem papel "owner" (acesso total) - ver decisao de papeis.
export async function criarEmpresaComAdmin(options: FixtureEmpresaOptions = {}) {
  const nomeEmpresa = options.nomeEmpresa ?? "Empresa Teste";
  const emailAdmin = options.emailAdmin ?? "admin@teste.com";
  const senhaAdmin = options.senhaAdmin ?? "senha-super-secreta";

  const [empresa] = await db.insert(empresas).values({ nome: nomeEmpresa }).returning();
  const [unidade] = await db
    .insert(unidades)
    .values({ empresaId: empresa.id, nome: "Unidade Teste" })
    .returning();
  const senhaHash = await hashPassword(senhaAdmin);
  const [usuario] = await db
    .insert(usuarios)
    .values({
      empresaId: empresa.id,
      nome: "Owner Teste",
      email: emailAdmin.toLowerCase(),
      senhaHash,
      papel: "owner",
    })
    .returning();

  return { empresa, unidade, usuario, senhaAdmin };
}

export async function criarFuncionario(empresaId: string, email = "funcionario@teste.com", senha = "senha-funcionario-123") {
  const senhaHash = await hashPassword(senha);
  const [usuario] = await db
    .insert(usuarios)
    .values({
      empresaId,
      nome: "Funcionario Teste",
      email: email.toLowerCase(),
      senhaHash,
      papel: "funcionario",
    })
    .returning();
  return { usuario, senha };
}
