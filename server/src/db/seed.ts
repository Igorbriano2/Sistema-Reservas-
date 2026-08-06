import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "./client.js";
import { plataformaAdmins, usuarios } from "./schema/index.js";
import { hashPassword } from "../lib/password.js";
import { criarEmpresaComOwner } from "../lib/empresas.js";

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@restaurante.com").toLowerCase();
  const senha = process.env.SEED_ADMIN_PASSWORD ?? "troque-esta-senha";

  const [usuarioExistente] = await db.select().from(usuarios).where(eq(usuarios.email, email)).limit(1);
  if (usuarioExistente) {
    console.log(`Usuario ${email} ja existe. Nada a fazer.`);
  } else {
    const { empresa } = await criarEmpresaComOwner(db, {
      nomeEmpresa: "Restaurante Demo",
      ownerNome: "Administrador",
      ownerEmail: email,
      ownerSenha: senha,
    });
    console.log(`Empresa "${empresa.nome}" criada com usuario owner ${email}.`);
  }

  // Opcional: so cria o primeiro login do painel da plataforma (voce) se as duas
  // variaveis forem passadas - nao faz parte do seed padrao de um restaurante.
  const plataformaEmail = process.env.SEED_PLATAFORMA_EMAIL?.toLowerCase();
  const plataformaSenha = process.env.SEED_PLATAFORMA_PASSWORD;
  if (plataformaEmail && plataformaSenha) {
    const [adminExistente] = await db
      .select()
      .from(plataformaAdmins)
      .where(eq(plataformaAdmins.email, plataformaEmail))
      .limit(1);
    if (adminExistente) {
      console.log(`Login de plataforma ${plataformaEmail} ja existe. Nada a fazer.`);
    } else {
      const senhaHash = await hashPassword(plataformaSenha);
      await db.insert(plataformaAdmins).values({ nome: "Dono da plataforma", email: plataformaEmail, senhaHash });
      console.log(`Login de plataforma criado: ${plataformaEmail}.`);
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Falha ao rodar seed:", err);
  process.exit(1);
});
