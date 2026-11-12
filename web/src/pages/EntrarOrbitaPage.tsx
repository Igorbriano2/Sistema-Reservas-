import { useEffect, useState } from "react";
import { API_URL } from "../api/client.js";
import { definirPainelModo, marcarFluxoCompleto } from "../lib/escolhaPainel.js";

// Entrada vinda do Orbita (modulo "Reservas" dentro da Gestao do Orbita): troca o
// codigo de 2 minutos por uma sessao do dono, ja escolhe o painel de gestao e a unidade
// e recarrega no destino - sem pedir login de novo.
export function EntrarOrbitaPage() {
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codigo = params.get("codigo");
    const destino = params.get("destino");
    const seguro = destino && /^\/admin(\/[a-z0-9-]*)*$/.test(destino) ? destino : "/admin/reservas";
    if (!codigo) {
      setErro("Link de entrada incompleto. Abra Reservas de novo pelo Orbita.");
      return;
    }
    fetch(`${API_URL}/auth/orbita-sso`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo }),
    })
      .then(async (r) => {
        const corpo = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(corpo.error ?? "Nao foi possivel entrar.");
        localStorage.setItem("token", corpo.token);
        localStorage.setItem("usuario", JSON.stringify(corpo.usuario));
        if (corpo.unidadeId) localStorage.setItem(`unidade_selecionada:${corpo.usuario.id}`, corpo.unidadeId);
        localStorage.setItem("origem_orbita", "1");
        definirPainelModo("gestao");
        marcarFluxoCompleto();
        window.location.replace(seguro);
      })
      .catch((e: Error) => setErro(e.message));
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
      {erro ? <p style={{ maxWidth: 420 }}>{erro}</p> : <p>Entrando no Quero Reservar…</p>}
    </div>
  );
}
