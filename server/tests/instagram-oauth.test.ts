import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import request from "supertest";
import { createApp } from "../src/app.js";
import { db } from "../src/db/client.js";
import { instagramConnections } from "../src/db/schema/index.js";
import { decrypt } from "../src/lib/crypto.js";
import { signAuthToken } from "../src/lib/jwt.js";
import { closeDb, criarEmpresaComAdmin, criarFuncionario, truncateAll } from "./helpers/db.js";

vi.mock("../src/lib/instagram-oauth.js", () => ({
  trocarCodePorContaInstagram: vi.fn(),
  assinarWebhookDaConta: vi.fn().mockResolvedValue(undefined),
  InstagramOAuthTrocaError: class extends Error {},
}));

const { trocarCodePorContaInstagram } = await import("../src/lib/instagram-oauth.js");
const { gerarState } = await import("../src/lib/instagram-oauth-state.js");

const app = createApp();

beforeEach(async () => {
  await truncateAll();
  vi.mocked(trocarCodePorContaInstagram).mockReset();
});

afterAll(async () => {
  await closeDb();
});

describe("GET /auth/instagram/connect", () => {
  it("redireciona com erro quando nao ha token de sessao", async () => {
    const res = await request(app).get("/auth/instagram/connect");
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("instagram_erro=nao_autorizado");
  });

  it("redireciona com erro quando o papel nao e owner", async () => {
    const { empresa } = await criarEmpresaComAdmin();
    const funcionario = await criarFuncionario(empresa.id);
    const token = signAuthToken({ sub: funcionario.usuario.id, empresaId: empresa.id, papel: "funcionario" });

    const res = await request(app).get("/auth/instagram/connect").query({ token });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("instagram_erro=nao_autorizado");
  });

  it("redireciona pro dialogo de OAuth da Meta com um state assinado quando owner", async () => {
    const { empresa, usuario } = await criarEmpresaComAdmin();
    const token = signAuthToken({ sub: usuario.id, empresaId: empresa.id, papel: "owner" });

    const res = await request(app).get("/auth/instagram/connect").query({ token });
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.hostname).toBe("www.facebook.com");
    expect(location.searchParams.get("state")).toBeTruthy();
    expect(location.searchParams.get("client_id")).toBe("test-instagram-app-id");
  });
});

describe("GET /auth/instagram/callback", () => {
  it("redireciona com erro quando o dono cancela o login na Meta", async () => {
    const res = await request(app).get("/auth/instagram/callback").query({ error: "access_denied" });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("instagram_erro=cancelado");
  });

  it("rejeita state invalido/adulterado (protecao contra CSRF)", async () => {
    const res = await request(app).get("/auth/instagram/callback").query({ code: "codigo-valido", state: "state-forjado" });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("instagram_erro=state_invalido");
    expect(trocarCodePorContaInstagram).not.toHaveBeenCalled();
  });

  it("rejeita state assinado por outro segredo (nao aceita so por 'parecer' um JWT)", async () => {
    const jwt = await import("jsonwebtoken");
    const stateForjado = jwt.sign({ empresaId: "empresa-forjada", purpose: "instagram_oauth_state" }, "segredo-errado");
    const res = await request(app).get("/auth/instagram/callback").query({ code: "codigo-valido", state: stateForjado });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("instagram_erro=state_invalido");
  });

  it("salva a conexao com o token SEMPRE cifrado (nunca em texto puro no banco)", async () => {
    const { empresa } = await criarEmpresaComAdmin();
    const state = gerarState({ empresaId: empresa.id });
    vi.mocked(trocarCodePorContaInstagram).mockResolvedValue({
      accessToken: "token-secreto-em-texto-puro",
      igBusinessAccountId: "ig-conta-123",
      handle: "restaurante_demo",
    });

    const res = await request(app).get("/auth/instagram/callback").query({ code: "codigo-valido", state });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("instagram_conectado=1");

    const [conexao] = await db
      .select()
      .from(instagramConnections)
      .where(and(eq(instagramConnections.empresaId, empresa.id), isNull(instagramConnections.unidadeId)));
    expect(conexao).toBeDefined();
    expect(conexao.accessTokenEncrypted).not.toBe("token-secreto-em-texto-puro");
    expect(conexao.accessTokenEncrypted.includes("token-secreto")).toBe(false);
    expect(decrypt(conexao.accessTokenEncrypted, process.env.TOKEN_ENCRYPTION_KEY!)).toBe("token-secreto-em-texto-puro");
    expect(conexao.handle).toBe("restaurante_demo");
    expect(conexao.status).toBe("ativo");
  });

  it("reconectar sobrescreve a conexao existente da mesma empresa, sem duplicar", async () => {
    const { empresa } = await criarEmpresaComAdmin();

    vi.mocked(trocarCodePorContaInstagram).mockResolvedValueOnce({
      accessToken: "token-conta-antiga",
      igBusinessAccountId: "ig-conta-antiga",
      handle: "conta_antiga",
    });
    await request(app).get("/auth/instagram/callback").query({ code: "codigo-1", state: gerarState({ empresaId: empresa.id }) });

    vi.mocked(trocarCodePorContaInstagram).mockResolvedValueOnce({
      accessToken: "token-conta-nova",
      igBusinessAccountId: "ig-conta-nova",
      handle: "conta_nova",
    });
    await request(app).get("/auth/instagram/callback").query({ code: "codigo-2", state: gerarState({ empresaId: empresa.id }) });

    const conexoes = await db
      .select()
      .from(instagramConnections)
      .where(and(eq(instagramConnections.empresaId, empresa.id), isNull(instagramConnections.unidadeId)));
    expect(conexoes).toHaveLength(1);
    expect(conexoes[0].handle).toBe("conta_nova");
    expect(conexoes[0].igBusinessAccountId).toBe("ig-conta-nova");
  });

  it("reconectar tambem reativa uma conexao que estava expirada", async () => {
    const { empresa } = await criarEmpresaComAdmin();
    vi.mocked(trocarCodePorContaInstagram).mockResolvedValueOnce({
      accessToken: "token-1",
      igBusinessAccountId: "ig-1",
      handle: "conta_1",
    });
    await request(app).get("/auth/instagram/callback").query({ code: "codigo-1", state: gerarState({ empresaId: empresa.id }) });
    await db
      .update(instagramConnections)
      .set({ status: "expirada" })
      .where(and(eq(instagramConnections.empresaId, empresa.id), isNull(instagramConnections.unidadeId)));

    vi.mocked(trocarCodePorContaInstagram).mockResolvedValueOnce({
      accessToken: "token-2",
      igBusinessAccountId: "ig-1",
      handle: "conta_1",
    });
    await request(app).get("/auth/instagram/callback").query({ code: "codigo-2", state: gerarState({ empresaId: empresa.id }) });

    const [conexao] = await db
      .select()
      .from(instagramConnections)
      .where(and(eq(instagramConnections.empresaId, empresa.id), isNull(instagramConnections.unidadeId)));
    expect(conexao.status).toBe("ativo");
  });

  it("redireciona com erro quando a troca de code por token falha", async () => {
    const { empresa } = await criarEmpresaComAdmin();
    vi.mocked(trocarCodePorContaInstagram).mockRejectedValue(new Error("Graph API fora do ar"));

    const res = await request(app).get("/auth/instagram/callback").query({ code: "codigo-valido", state: gerarState({ empresaId: empresa.id }) });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("instagram_erro=falha_troca_token");
  });
});
