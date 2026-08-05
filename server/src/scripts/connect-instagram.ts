import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/client.js";
import { empresas, instagramConnections, unidades } from "../db/schema/index.js";
import { encrypt } from "../lib/crypto.js";

// Conexao manual do MVP: nenhum fluxo OAuth self-service. O dono do sistema pega o
// access token de longa duracao no App Dashboard da Meta e roda este script uma vez
// por unidade (ou uma vez por empresa, se a mesma conta do Instagram atender todas
// as unidades). Uso:
//
//   INSTAGRAM_BUSINESS_ACCOUNT_ID=... INSTAGRAM_ACCESS_TOKEN=... TOKEN_ENCRYPTION_KEY=... \
//     npm run instagram:connect -- --empresa-id <uuid> [--unidade-id <uuid>]
function lerArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const empresaId = lerArg("--empresa-id");
  const unidadeId = lerArg("--unidade-id");
  const igBusinessAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const chave = process.env.TOKEN_ENCRYPTION_KEY;

  if (!empresaId || !igBusinessAccountId || !accessToken || !chave) {
    console.error(
      "Uso: INSTAGRAM_BUSINESS_ACCOUNT_ID=... INSTAGRAM_ACCESS_TOKEN=... TOKEN_ENCRYPTION_KEY=... " +
        "npm run instagram:connect -- --empresa-id <uuid> [--unidade-id <uuid>]",
    );
    process.exit(1);
  }

  const [empresa] = await db.select().from(empresas).where(eq(empresas.id, empresaId)).limit(1);
  if (!empresa) {
    console.error(`Empresa ${empresaId} nao encontrada.`);
    process.exit(1);
  }

  if (unidadeId) {
    const [unidade] = await db.select().from(unidades).where(eq(unidades.id, unidadeId)).limit(1);
    if (!unidade || unidade.empresaId !== empresaId) {
      console.error(`Unidade ${unidadeId} nao encontrada nesta empresa.`);
      process.exit(1);
    }
  }

  const accessTokenEncrypted = encrypt(accessToken, chave);

  const [conexao] = await db
    .insert(instagramConnections)
    .values({
      empresaId,
      unidadeId: unidadeId ?? null,
      igBusinessAccountId,
      accessTokenEncrypted,
      status: "ativo",
    })
    .returning();

  console.log(
    `Conexao criada (id=${conexao.id}) para a empresa "${empresa.nome}", conta do Instagram ${igBusinessAccountId}.`,
  );
  await pool.end();
}

main().catch((err) => {
  console.error("Falha ao conectar o Instagram:", err);
  process.exit(1);
});
