import { registerSW } from "virtual:pwa-register";

// Registra o service worker do shell da aplicacao (cache pra abrir rapido, sem
// suporte offline completo - ver vite.config.ts). "autoUpdate" troca a versao
// cacheada sozinho quando um novo build sobe, sem precisar de prompt pro usuario.
export function registrarServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  registerSW({ immediate: true });
}
