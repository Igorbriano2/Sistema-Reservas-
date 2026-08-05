import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "./client.js";
import { empresas, unidades, usuarios, agenteConfig } from "./schema/index.js";
import { hashPassword } from "../lib/password.js";

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@restaurante.com").toLowerCase();
  const senha = process.env.SEED_ADMIN_PASSWORD ?? "troque-esta-senha";

  const [usuarioExistente] = await db.select().from(usuarios).where(eq(usuarios.email, email)).limit(1);
  if (usuarioExistente) {
    console.log(`Usuario ${email} ja existe. Nada a fazer.`);
    await pool.end();
    return;
  }

  const [empresa] = await db
    .insert(empresas)
    .values({ nome: "Restaurante Demo", plano: "trial" })
    .returning();

  await db.insert(unidades).values({
    empresaId: empresa.id,
    nome: "Unidade Principal",
    timezone: "America/Sao_Paulo",
  });

  await db.insert(agenteConfig).values({
    empresaId: empresa.id,
    nomeDoAgente: "Assistente",
    descricaoRestaurante: "Restaurante Demo",
    saudacao: "Ola! Como posso ajudar com sua reserva?",
    despedida: "Ate breve!",
  });

  const senhaHash = await hashPassword(senha);
  await db.insert(usuarios).values({
    empresaId: empresa.id,
    nome: "Administrador",
    email,
    senhaHash,
    papel: "admin",
  });

  console.log(`Empresa "${empresa.nome}" criada com usuario admin ${email}.`);
  await pool.end();
}

main().catch((err) => {
  console.error("Falha ao rodar seed:", err);
  process.exit(1);
});
