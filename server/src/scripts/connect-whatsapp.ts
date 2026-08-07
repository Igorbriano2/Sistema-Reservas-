import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/client.js";
import { empresas, whatsappConnections, unidades } from "../db/schema/index.js";
import { encrypt } from "../lib/crypto.js";

// Conexao manual do MVP (mesmo padrao do instagram:connect): nenhum fluxo OAuth
// self-service/Embedded Signup ainda. O dono do sistema pega o WABA ID, o Phone
// Number ID e um access token de longa duracao no App Dashboard da Meta e roda este
// script uma vez por unidade (ou uma vez por empresa, se o mesmo numero atender
// todas as unidades). Uso:
//
//   WABA_ID=... PHONE_NUMBER_ID=... WHATSAPP_ACCESS_TOKEN=... TOKEN_ENCRYPTION_KEY=... \
//     npm run whatsapp:connect -- --empresa-id <uuid> [--unidade-id <uuid>]
function lerArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const empresaId = lerArg("--empresa-id");
  const unidadeId = lerArg("--unidade-id");
  const wabaId = process.env.WABA_ID;
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const chave = process.env.TOKEN_ENCRYPTION_KEY;

  if (!empresaId || !wabaId || !phoneNumberId || !accessToken || !chave) {
    console.error(
      "Uso: WABA_ID=... PHONE_NUMBER_ID=... WHATSAPP_ACCESS_TOKEN=... TOKEN_ENCRYPTION_KEY=... " +
        "npm run whatsapp:connect -- --empresa-id <uuid> [--unidade-id <uuid>]",
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
    .insert(whatsappConnections)
    .values({
      empresaId,
      unidadeId: unidadeId ?? null,
      wabaId,
      phoneNumberId,
      accessTokenEncrypted,
      status: "ativo",
    })
    .returning();

  console.log(`Conexao criada (id=${conexao.id}) para a empresa "${empresa.nome}", numero WhatsApp ${phoneNumberId}.`);
  await pool.end();
}

main().catch((err) => {
  console.error("Falha ao conectar o WhatsApp:", err);
  process.exit(1);
});
