import { desinscreverPush, inscreverPush, obterChavePublicaPush } from "../api/resources.js";

// Push API pede a chave VAPID em Uint8Array, mas o backend manda em base64url -
// conversao padrao recomendada pela MDN.
function base64UrlParaUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function suportaPush(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function permissaoNotificacao(): NotificationPermission | "indisponivel" {
  return suportaPush() ? Notification.permission : "indisponivel";
}

// So deve ser chamada a partir de uma interacao explicita do usuario (clique num
// botao "Ativar notificacoes") - nunca automaticamente ao carregar a pagina, pra nao
// travar a tela com o prompt nativo do navegador logo de cara.
export async function ativarNotificacoes(unidadeId: string): Promise<{ ok: boolean; motivo?: string }> {
  if (!suportaPush()) return { ok: false, motivo: "Este navegador nao suporta notificacoes push." };

  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") return { ok: false, motivo: "Permissao de notificacao negada." };

  const { chavePublica } = await obterChavePublicaPush(unidadeId);
  if (!chavePublica) return { ok: false, motivo: "Notificacoes push nao configuradas neste ambiente." };

  const registro = await navigator.serviceWorker.ready;
  let subscription = await registro.pushManager.getSubscription();
  if (!subscription) {
    try {
      subscription = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlParaUint8Array(chavePublica) as BufferSource,
      });
    } catch {
      // Falha na inscricao junto ao servico de push do navegador (rede indisponivel,
      // navegador sem suporte real apesar de anunciar a API, etc) - nao deve derrubar
      // a pagina, so informa que nao deu.
      return { ok: false, motivo: "Nao foi possivel se inscrever no servico de notificacoes deste navegador." };
    }
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, motivo: "Nao foi possivel concluir a inscricao." };
  }

  await inscreverPush(unidadeId, { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
  return { ok: true };
}

export async function desativarNotificacoes(unidadeId: string): Promise<void> {
  if (!suportaPush()) return;
  const registro = await navigator.serviceWorker.ready;
  const subscription = await registro.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await desinscreverPush(unidadeId, endpoint);
}

export async function estaInscrito(): Promise<boolean> {
  if (!suportaPush()) return false;
  const registro = await navigator.serviceWorker.ready;
  const subscription = await registro.pushManager.getSubscription();
  return !!subscription;
}
