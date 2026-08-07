import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png"],
      manifest: {
        name: "Quero Reservar",
        short_name: "Quero Reservar",
        description: "Painel de gestao de reservas para restaurantes",
        lang: "pt-BR",
        // Abre direto no painel admin ao instalar - e o uso mobile alvo
        // (funcionario na portaria), nao a landing page.
        start_url: "/admin",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        theme_color: "#0d0d0d",
        background_color: "#0d0d0d",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // So o shell (JS/CSS/HTML/icones) pra abrir rapido mesmo com conexao ruim -
        // sem cache de respostas de API, sem suporte offline completo (nao e o objetivo).
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
