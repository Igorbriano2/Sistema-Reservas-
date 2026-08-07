import { Router } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { env } from "../../config/env.js";
import { instagramConnections } from "../../db/schema/index.js";
import { verifyAuthToken } from "../../lib/jwt.js";
import { encrypt } from "../../lib/crypto.js";
import { gerarState, verificarState, InstagramOAuthStateInvalidoError } from "../../lib/instagram-oauth-state.js";
import { trocarCodePorContaInstagram, assinarWebhookDaConta, InstagramOAuthTrocaError } from "../../lib/instagram-oauth.js";

export const instagramOAuthRouter = Router();

// Todo erro leva de volta pra tela de config do agente com ?instagram_erro=<motivo> -
// nunca deixa o navegador numa pagina em branco/erro cru do Express (ver doc 14).
function redirecionarComErro(res: import("express").Response, motivo: string) {
  const base = env.WEB_APP_URL ? `${env.WEB_APP_URL}/admin/agente` : "/admin/agente";
  res.redirect(`${base}?instagram_erro=${encodeURIComponent(motivo)}`);
}

function redirecionarComSucesso(res: import("express").Response) {
  const base = env.WEB_APP_URL ? `${env.WEB_APP_URL}/admin/agente` : "/admin/agente";
  res.redirect(`${base}?instagram_conectado=1`);
}

function redirectUriConfigurada(): string | null {
  return env.INSTAGRAM_OAUTH_REDIRECT_URI ?? null;
}

// GET /auth/instagram/connect?token=<jwt-de-sessao> - inicia o fluxo. E uma navegacao
// de pagina inteira (link/redirect), nao um fetch com header Authorization, por isso
// o token de sessao viaja como query param aqui (curto prazo, HTTPS, consumido na
// hora) so pra essa unica etapa - o resto do painel continua usando o header normal.
instagramOAuthRouter.get("/connect", (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  if (!token) {
    redirecionarComErro(res, "nao_autorizado");
    return;
  }

  let auth;
  try {
    auth = verifyAuthToken(token);
  } catch {
    redirecionarComErro(res, "nao_autorizado");
    return;
  }

  if (auth.papel !== "owner") {
    redirecionarComErro(res, "nao_autorizado");
    return;
  }

  const redirectUri = redirectUriConfigurada();
  if (!env.INSTAGRAM_APP_ID || !redirectUri) {
    redirecionarComErro(res, "nao_configurado");
    return;
  }

  const state = gerarState({ empresaId: auth.empresaId });
  const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  url.searchParams.set("client_id", env.INSTAGRAM_APP_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "instagram_basic,instagram_manage_messages,pages_messaging,pages_manage_metadata");

  res.redirect(url.toString());
});

// GET /auth/instagram/callback?code=...&state=... (ou ?error=... se o dono cancelou
// o login no meio do fluxo da Meta).
instagramOAuthRouter.get("/callback", async (req, res) => {
  if (req.query.error) {
    redirecionarComErro(res, "cancelado");
    return;
  }

  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  if (!code || !state) {
    redirecionarComErro(res, "parametros_invalidos");
    return;
  }

  let empresaId: string;
  try {
    ({ empresaId } = verificarState(state));
  } catch (err) {
    if (err instanceof InstagramOAuthStateInvalidoError) {
      redirecionarComErro(res, "state_invalido");
      return;
    }
    throw err;
  }

  const redirectUri = redirectUriConfigurada();
  if (!redirectUri) {
    redirecionarComErro(res, "nao_configurado");
    return;
  }

  if (!env.TOKEN_ENCRYPTION_KEY) {
    redirecionarComErro(res, "nao_configurado");
    return;
  }

  let conta;
  try {
    conta = await trocarCodePorContaInstagram(code, redirectUri);
  } catch (err) {
    console.error("[instagram-oauth] falha ao trocar code por conta:", err instanceof InstagramOAuthTrocaError ? err.message : err);
    redirecionarComErro(res, "falha_troca_token");
    return;
  }

  const accessTokenEncrypted = encrypt(conta.accessToken, env.TOKEN_ENCRYPTION_KEY);

  // A conexao fica no nivel da empresa (unidade_id nulo) - reconectar (ou trocar de
  // conta) sobrescreve a conexao existente da empresa em vez de duplicar.
  const [existente] = await db
    .select()
    .from(instagramConnections)
    .where(and(eq(instagramConnections.empresaId, empresaId), isNull(instagramConnections.unidadeId)))
    .limit(1);

  if (existente) {
    await db
      .update(instagramConnections)
      .set({
        igBusinessAccountId: conta.igBusinessAccountId,
        handle: conta.handle,
        accessTokenEncrypted,
        status: "ativo",
      })
      .where(eq(instagramConnections.id, existente.id));
  } else {
    await db.insert(instagramConnections).values({
      empresaId,
      unidadeId: null,
      igBusinessAccountId: conta.igBusinessAccountId,
      handle: conta.handle,
      accessTokenEncrypted,
      status: "ativo",
    });
  }

  // Best-effort - o dono nao deve precisar configurar isso manualmente no painel da
  // Meta, mas uma falha aqui nao deve impedir a conexao de ser considerada concluida.
  assinarWebhookDaConta(conta.accessToken, conta.igBusinessAccountId).catch((err) => {
    console.error("[instagram-oauth] falha ao assinar webhook automaticamente:", err);
  });

  redirecionarComSucesso(res);
});
