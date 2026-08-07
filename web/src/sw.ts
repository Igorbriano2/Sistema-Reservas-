/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";
import { clientsClaim } from "workbox-core";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// Precache do shell (gerado pelo vite-plugin-pwa em build, injectManifest) - so pra
// abrir rapido mesmo com conexao ruim, sem suporte offline completo.
precacheAndRoute(self.__WB_MANIFEST);

self.skipWaiting();
clientsClaim();

interface PayloadNotificacao {
  titulo: string;
  corpo: string;
  url?: string;
}

// Nova reserva / cancelamento pelo cliente no chat (doc 15, ver server/src/lib/push.ts) -
// o payload chega como JSON no corpo do evento push.
self.addEventListener("push", (event: PushEvent) => {
  let dados: PayloadNotificacao = { titulo: "Quero Reservar", corpo: "" };
  try {
    if (event.data) dados = event.data.json();
  } catch {
    // payload nao-JSON (nao deveria acontecer, ver push.ts) - usa o titulo padrao.
  }

  event.waitUntil(
    self.registration.showNotification(dados.titulo, {
      body: dados.corpo,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: dados.url ?? "/admin/reservas" },
    }),
  );
});

// Clica na notificacao -> foca uma aba ja aberta no painel, ou abre uma nova na rota
// indicada pelo payload.
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url ?? "/admin/reservas";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
