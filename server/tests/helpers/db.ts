import { sql } from "drizzle-orm";
import { db, pool } from "../../src/db/client.js";
import { empresas, unidades, usuarios, usuarioUnidades } from "../../src/db/schema/index.js";
import { hashPassword } from "../../src/lib/password.js";
import { derivarSlugDoNome, gerarSlugDisponivel } from "../../src/lib/empresas.js";

export async function truncateAll(): Promise<void> {
  // CASCADE arrasta todas as tabelas dependentes (unidades, usuarios, mesas,
  // reservas, conversas, assinaturas, etc.), entao truncar empresas basta para limpar
  // quase tudo. plataforma_admins, waitlist_leads e stripe_webhook_eventos ficam de
  // fora da cascata de proposito (nao tem FK pra empresas - sao independentes de
  // qualquer restaurante), entao precisam ser truncadas explicitamente aqui tambem.
  await db.execute(
    sql`TRUNCATE TABLE empresas, plataforma_admins, waitlist_leads, stripe_webhook_eventos RESTART IDENTITY CASCADE`,
  );
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
  // Slug unico por chamada (mesmo gerador usado em producao) - alguns testes chamam
  // esta fixture mais de uma vez no mesmo teste (ex: setupDuasEmpresas), entao um slug
  // fixo colidiria com a constraint unique na segunda chamada.
  const slug = await gerarSlugDisponivel(db, derivarSlugDoNome("Unidade Teste"));
  const [unidade] = await db
    .insert(unidades)
    .values({ empresaId: empresa.id, nome: "Unidade Teste", slug })
    .returning();
  const senhaHash = await hashPassword(senhaAdmin);
  const [usuarioLinha] = await db
    .insert(usuarios)
    .values({
      empresaId: empresa.id,
      nome: "Owner Teste",
      email: emailAdmin.toLowerCase(),
      // Sanitiza o e-mail inteiro (nao so a parte local) pra nao colidir quando dois
      // testes criam admins com o mesmo prefixo antes do @ (ex: admin@a.com / admin@b.com).
      username: emailAdmin.toLowerCase().replace(/[^a-z0-9]/g, ""),
      senhaHash,
      papel: "owner",
    })
    .returning();
  // Owner sempre tem email nesta fixture (e o requisito real de sinal) - o tipo da
  // coluna e nullable so por causa de gerente/funcionario, entao o cast aqui e seguro
  // e evita "string | null" vazando pra toda chamada de login(...) nos testes.
  const usuario = { ...usuarioLinha, email: usuarioLinha.email as string };

  return { empresa, unidade, usuario, senhaAdmin };
}

// gerente/funcionario nao tem email (doc 17) - login e por username+senha, definidos
// pelo dono na hora de criar. unidadeIds default pra [] (chame criarUsuarioUnidade
// separadamente quando o teste precisar de escopo de unidade especifico).
export async function criarFuncionario(empresaId: string, username = "funcionario.teste", senha = "senha-funcionario-123") {
  const senhaHash = await hashPassword(senha);
  const [usuarioLinha] = await db
    .insert(usuarios)
    .values({
      empresaId,
      nome: "Funcionario Teste",
      username: username.toLowerCase(),
      senhaHash,
      papel: "funcionario",
    })
    .returning();
  const usuario = { ...usuarioLinha, username: usuarioLinha.username as string };
  return { usuario, senha };
}

// Da acesso de um gerente/funcionario a uma unidade (ver middleware/permissao -
// requireAcessoUnidade/requirePermissaoUnidade/requirePermissaoEmpresa, doc 17).
// permissoesExtra vazio = so a baseline (reservas do dia), sem nenhuma funcionalidade
// extra liberada.
export async function criarUsuarioUnidade(usuarioId: string, unidadeId: string, permissoesExtra: string[] = []) {
  const [linha] = await db.insert(usuarioUnidades).values({ usuarioId, unidadeId, permissoesExtra }).returning();
  return linha;
}
