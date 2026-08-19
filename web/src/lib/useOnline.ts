import { useEffect, useState } from "react";

// Doc redesign, etapa PWA/mobile ("estados offline e reconexao") - o app NAO tem
// suporte offline de dados (cache do service worker e so do shell, ver vite.config.ts)
// e essa etapa foi explicita em nao inventar essa infraestrutura agora. O minimo
// correto sem isso: avisar quando a conexao cai (em vez de deixar cada tela falhar
// com uma mensagem generica de erro que parece um bug) e sumir sozinho quando volta.
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    function aoFicarOnline() {
      setOnline(true);
    }
    function aoFicarOffline() {
      setOnline(false);
    }
    window.addEventListener("online", aoFicarOnline);
    window.addEventListener("offline", aoFicarOffline);
    return () => {
      window.removeEventListener("online", aoFicarOnline);
      window.removeEventListener("offline", aoFicarOffline);
    };
  }, []);

  return online;
}
