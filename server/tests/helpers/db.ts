import { sql } from "drizzle-orm";
import { db, pool } from "../../src/db/client.js";
import { empresas, unidades, usuarios } from "../../src/db/schema/index.js";
import { hashPassword } from "../../src/lib/password.js";

export async function truncateAll(): Promise<void> {
  // CASCADE arrasta todas as tabelas dependentes (unidades, usuarios, mesas,
  // reservas, conversas, etc.), entao truncar empresas basta para limpar tudo.
  await db.execute(sql`TRUNCATE TABLE empresas RESTART IDENTITY CASCADE`);
}

export async function closeDb(): Promise<void> {
  await pool.end();
}

interface FixtureEmpresaOptions {
  nomeEmpresa?: string;
  emailAdmin?: string;
  senhaAdmin?: string;
}

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
      nome: "Admin Teste",
      email: emailAdmin.toLowerCase(),
      senhaHash,
      papel: "admin",
    })
    .returning();

  return { empresa, unidade, usuario, senhaAdmin };
}
