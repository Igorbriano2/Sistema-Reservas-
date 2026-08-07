import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { instagramConnections } from "../src/db/schema/index.js";
import { closeDb, criarEmpresaComAdmin, truncateAll } from "./helpers/db.js";
import { criarConexaoInstagram, criarConversa } from "./helpers/fixtures.js";

vi.mock("../src/lib/instagram-api.js", async () => {
  const real = await vi.importActual<typeof import("../src/lib/instagram-api.js")>("../src/lib/instagram-api.js");
  return {
    ...real,
    enviarMensagemInstagram: vi.fn(),
  };
});

const { enviarMensagemInstagram, InstagramAuthError } = await import("../src/lib/instagram-api.js");
const { enviarRespostaDoAgente } = await import("../src/lib/instagram-notify.js");

beforeEach(async () => {
  await truncateAll();
  vi.mocked(enviarMensagemInstagram).mockReset();
});

afterAll(async () => {
  await closeDb();
});

describe("Deteccao de token expirado (doc 14)", () => {
  it("marca a conexao como 'expirada' quando o envio falha com InstagramAuthError", async () => {
    const { empresa, unidade } = await criarEmpresaComAdmin();
    const conexao = await criarConexaoInstagram(empresa.id, unidade.id, "ig-conta-1");
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-1");

    vi.mocked(enviarMensagemInstagram).mockRejectedValue(new InstagramAuthError("token expirado"));

    await expect(
      enviarRespostaDoAgente(db, { unidadeId: unidade.id, igSenderId: "ig-cliente-1", conversaId: conversa.id, texto: "oi" }),
    ).rejects.toThrow(InstagramAuthError);

    const [atualizada] = await db.select().from(instagramConnections).where(eq(instagramConnections.id, conexao.id));
    expect(atualizada.status).toBe("expirada");
  });

  it("NAO marca a conexao como expirada num erro generico de envio (rede, etc)", async () => {
    const { empresa, unidade } = await criarEmpresaComAdmin();
    const conexao = await criarConexaoInstagram(empresa.id, unidade.id, "ig-conta-2");
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-2");

    vi.mocked(enviarMensagemInstagram).mockRejectedValue(new Error("falha de rede generica"));

    await expect(
      enviarRespostaDoAgente(db, { unidadeId: unidade.id, igSenderId: "ig-cliente-2", conversaId: conversa.id, texto: "oi" }),
    ).rejects.toThrow("falha de rede generica");

    const [atualizada] = await db.select().from(instagramConnections).where(eq(instagramConnections.id, conexao.id));
    expect(atualizada.status).toBe("ativo");
  });

  it("mantem status ativo e registra a mensagem quando o envio da certo", async () => {
    const { empresa, unidade } = await criarEmpresaComAdmin();
    const conexao = await criarConexaoInstagram(empresa.id, unidade.id, "ig-conta-3");
    const conversa = await criarConversa(empresa.id, unidade.id, "ig-cliente-3");

    vi.mocked(enviarMensagemInstagram).mockResolvedValue("mid-123");

    await enviarRespostaDoAgente(db, { unidadeId: unidade.id, igSenderId: "ig-cliente-3", conversaId: conversa.id, texto: "oi" });

    const [atualizada] = await db.select().from(instagramConnections).where(eq(instagramConnections.id, conexao.id));
    expect(atualizada.status).toBe("ativo");
  });
});
