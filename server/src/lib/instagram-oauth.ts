import { env } from "../config/env.js";

const GRAPH_API_VERSION = "v21.0";

export interface ContaInstagramConectada {
  accessToken: string;
  igBusinessAccountId: string;
  handle: string;
}

export class InstagramOAuthTrocaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstagramOAuthTrocaError";
  }
}

interface RespostaGraphApi {
  error?: { message?: string };
  access_token?: string;
  data?: Array<{ instagram_business_account?: { id?: string } }>;
  username?: string;
}

async function graphFetch(path: string, params: Record<string, string>, metodo: "GET" | "POST" = "GET"): Promise<RespostaGraphApi> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}${path}`);
  const opcoes: RequestInit = { method: metodo };
  if (metodo === "GET") {
    for (const [chave, valor] of Object.entries(params)) url.searchParams.set(chave, valor);
  } else {
    opcoes.body = new URLSearchParams(params);
  }

  const resposta = await fetch(url.toString(), opcoes);
  const dados = (await resposta.json().catch(() => ({}))) as RespostaGraphApi;
  if (!resposta.ok || dados.error) {
    throw new InstagramOAuthTrocaError(dados.error?.message ?? `Falha na chamada a Graph API (${resposta.status})`);
  }
  return dados;
}

// Fluxo completo do "Meta Login for Business": troca o code pelo token curto, troca
// o token curto pelo de longa duracao (~60 dias), descobre a Pagina do Facebook
// vinculada e a conta do Instagram profissional conectada a ela, e busca o @handle
// so pra exibicao no painel (nunca usado pra autenticar nada).
export async function trocarCodePorContaInstagram(code: string, redirectUri: string): Promise<ContaInstagramConectada> {
  if (!env.INSTAGRAM_APP_ID || !env.INSTAGRAM_APP_SECRET) {
    throw new InstagramOAuthTrocaError("INSTAGRAM_APP_ID/INSTAGRAM_APP_SECRET nao configurados");
  }

  const tokenCurto = await graphFetch("/oauth/access_token", {
    client_id: env.INSTAGRAM_APP_ID,
    client_secret: env.INSTAGRAM_APP_SECRET,
    redirect_uri: redirectUri,
    code,
  });
  if (!tokenCurto.access_token) {
    throw new InstagramOAuthTrocaError("Resposta da Graph API sem access_token (troca inicial do code)");
  }

  const tokenLongo = await graphFetch("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: env.INSTAGRAM_APP_ID,
    client_secret: env.INSTAGRAM_APP_SECRET,
    fb_exchange_token: tokenCurto.access_token,
  });
  const accessToken = tokenLongo.access_token;
  if (!accessToken) {
    throw new InstagramOAuthTrocaError("Resposta da Graph API sem access_token (troca pro token de longa duracao)");
  }

  const paginas = await graphFetch("/me/accounts", { access_token: accessToken });
  const pagina = paginas.data?.[0];
  const igBusinessAccountId = pagina?.instagram_business_account?.id;
  if (!igBusinessAccountId) {
    throw new InstagramOAuthTrocaError(
      "Nenhuma conta do Instagram profissional vinculada a pagina do Facebook conectada. " +
        "Confirme que a conta e uma Conta Comercial/Criador de Conteudo vinculada a uma Pagina do Facebook.",
    );
  }

  const conta = await graphFetch(`/${igBusinessAccountId}`, { fields: "username", access_token: accessToken });

  return { accessToken, igBusinessAccountId, handle: conta.username ?? "" };
}

// Best-effort: assina o webhook da conta automaticamente na conclusao do OAuth, pra
// o dono nao precisar configurar nada manualmente no painel da Meta (ver doc 14).
export async function assinarWebhookDaConta(accessToken: string, igBusinessAccountId: string): Promise<void> {
  await graphFetch(`/${igBusinessAccountId}/subscribed_apps`, { subscribed_fields: "messages", access_token: accessToken }, "POST");
}
