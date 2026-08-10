import { useEffect, useState } from "react";
import { ativarNotificacoes, desativarNotificacoes, estaInscrito, permissaoNotificacao, suportaPush } from "../lib/push.js";

function IconeSino() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function IconeSinoDesligado() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-9.33-5M6 6.5C4.6 8 3 10.2 3 14v3h15" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

// Ativa/desativa notificacoes push pra este dispositivo (doc 15) - so pede permissao
// ao navegador quando o usuario clica aqui, nunca automaticamente ao carregar a
// pagina (o navegador ja bloqueia prompts intrusivos, mas isso tambem evita o
// usuario recusar de cara sem entender pra que serve).
export function NotificacaoToggle({ unidadeId }: { unidadeId: string }) {
  const [inscrito, setInscrito] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!suportaPush()) return;
    estaInscrito(unidadeId).then(setInscrito);
  }, [unidadeId]);

  if (!suportaPush()) return null;

  async function alternar() {
    setErro(null);
    setCarregando(true);
    try {
      if (inscrito) {
        await desativarNotificacoes(unidadeId);
        setInscrito(false);
      } else {
        const resultado = await ativarNotificacoes(unidadeId);
        if (resultado.ok) {
          setInscrito(true);
        } else {
          setErro(resultado.motivo ?? "Nao foi possivel ativar as notificacoes.");
        }
      }
    } catch {
      setErro("Nao foi possivel completar a operacao. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  const permissaoNegada = permissaoNotificacao() === "denied";

  return (
    <button
      type="button"
      className="btn btn-secundario btn-icone"
      onClick={alternar}
      disabled={carregando || permissaoNegada}
      aria-label={inscrito ? "Desativar notificacoes" : "Ativar notificacoes"}
      title={
        permissaoNegada
          ? "Notificacoes bloqueadas nas configuracoes do navegador"
          : erro ??
            (inscrito
              ? "Notificacoes ativas - clique pra desativar"
              : "Ativar notificacoes de novas reservas (nesse dispositivo, so pra uma loja por vez)")
      }
    >
      {inscrito ? <IconeSino /> : <IconeSinoDesligado />}
    </button>
  );
}
