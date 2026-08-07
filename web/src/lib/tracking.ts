// Tracking de marketing do PROPRIO restaurante (doc 13) - Google Tag (GA4/Google
// Ads) e Facebook Pixel, disparados na pagina publica de reserva. So carregado
// depois do consentimento de cookies do cliente e so quando o dono configurou um id
// (ver AgentConfigPage.tsx / GET /public/reservation-link/:token).

type FbqFn = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  loaded: boolean;
  version: string;
  push: FbqFn;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: FbqFn;
    _fbq?: FbqFn;
  }
}

export function carregarGoogleTag(id: string): void {
  if (document.querySelector(`script[data-google-tag="${id}"]`)) return;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  script.dataset.googleTag = id;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  };
  window.gtag("js", new Date());
  window.gtag("config", id);
}

export function carregarFacebookPixel(id: string): void {
  if (window.fbq) {
    window.fbq("init", id);
    window.fbq("track", "PageView");
    return;
  }

  const fbq: FbqFn = ((...args: unknown[]) => {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  }) as FbqFn;
  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.push = fbq;
  window.fbq = fbq;
  window._fbq = fbq;

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);

  window.fbq("init", id);
  window.fbq("track", "PageView");
}

export function dispararEventoGA4(nome: string, params?: Record<string, unknown>): void {
  window.gtag?.("event", nome, params);
}

export function dispararEventoFacebook(nome: string, params?: Record<string, unknown>): void {
  window.fbq?.("track", nome, params);
}
