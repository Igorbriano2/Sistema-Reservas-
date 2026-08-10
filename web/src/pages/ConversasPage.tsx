import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.js";
import { ApiError } from "../api/client.js";
import { definirAgentePausado, listarConversas, listarMensagensDaConversa } from "../api/resources.js";
import type { Conversa, Mensagem } from "../types.js";

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function ConversasPage() {
  const { unidade } = useAuth();
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [somentePausadas, setSomentePausadas] = useState(true);

  const [conversaAberta, setConversaAberta] = useState<Conversa | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [carregandoMensagens, setCarregandoMensagens] = useState(false);
  const [reativando, setReativando] = useState(false);

  async function carregar() {
    if (!unidade) return;
    setCarregando(true);
    setErro(null);
    try {
      setConversas(await listarConversas(unidade.id));
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível carregar as conversas.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidade?.id]);

  async function abrirConversa(conversa: Conversa) {
    if (!unidade) return;
    setConversaAberta(conversa);
    setCarregandoMensagens(true);
    try {
      setMensagens(await listarMensagensDaConversa(unidade.id, conversa.id));
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível carregar as mensagens.");
    } finally {
      setCarregandoMensagens(false);
    }
  }

  async function reativarAgente() {
    if (!unidade || !conversaAberta) return;
    setReativando(true);
    try {
      const atualizada = await definirAgentePausado(unidade.id, conversaAberta.id, false);
      setConversaAberta(atualizada);
      setConversas((lista) => lista.map((c) => (c.id === atualizada.id ? atualizada : c)));
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível reativar o agente.");
    } finally {
      setReativando(false);
    }
  }

  if (!unidade) return <p>Carregando unidade...</p>;

  const listaFiltrada = somentePausadas ? conversas.filter((c) => c.agentPaused) : conversas;

  return (
    <div>
      {erro && <p className="erro">{erro}</p>}
      <div className="cartao">
        <h3 style={{ marginTop: 0 }}>Conversas</h3>
        <p className="texto-secundario" style={{ fontSize: "0.85rem", marginTop: 0 }}>
          Quando o agente de IA encaminha um cliente pra atendimento humano (ou alguém responde direto pelo
          Instagram), a conversa fica pausada aqui até você reativar — o agente não volta a responder sozinho até
          isso acontecer.
        </p>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <input type="checkbox" checked={somentePausadas} onChange={(e) => setSomentePausadas(e.target.checked)} />
          Mostrar só as pausadas (aguardando atendimento)
        </label>

        {carregando ? (
          <p>Carregando...</p>
        ) : listaFiltrada.length === 0 ? (
          <p className="texto-secundario">
            {somentePausadas ? "Nenhuma conversa aguardando atendimento no momento." : "Nenhuma conversa ainda."}
          </p>
        ) : (
          <div className="tabela-scroll">
            <table>
              <thead>
                <tr>
                  <th>Cliente (Instagram)</th>
                  <th>Situação</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.map((conversa) => (
                  <tr key={conversa.id}>
                    <td>{conversa.igSenderId}</td>
                    <td>
                      {conversa.agentPaused ? (
                        <span className="badge badge-pendente">Aguardando humano</span>
                      ) : (
                        <span className="badge badge-confirmada">Agente ativo</span>
                      )}
                    </td>
                    <td>
                      <button className="btn btn-secundario" onClick={() => abrirConversa(conversa)}>
                        Ver mensagens
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {conversaAberta && (
        <div className="cartao">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ marginTop: 0 }}>Conversa com {conversaAberta.igSenderId}</h3>
            <div className="acoes">
              {conversaAberta.agentPaused && (
                <button className="btn" onClick={reativarAgente} disabled={reativando}>
                  {reativando ? "Reativando..." : "Reativar agente"}
                </button>
              )}
              <button className="btn btn-secundario" onClick={() => setConversaAberta(null)}>
                Fechar
              </button>
            </div>
          </div>
          {carregandoMensagens ? (
            <p>Carregando mensagens...</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "420px", overflowY: "auto" }}>
              {mensagens.map((m) => (
                <div
                  key={m.id}
                  style={{
                    alignSelf: m.papel === "user" ? "flex-start" : "flex-end",
                    maxWidth: "75%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "10px",
                    background: m.papel === "user" ? "var(--bg-elevated)" : "rgba(var(--accent-rgb), 0.15)",
                  }}
                >
                  <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{m.conteudo}</p>
                  <p className="texto-secundario" style={{ margin: 0, fontSize: "0.75rem" }}>
                    {m.papel === "user" ? "Cliente" : m.enviadoPorHumano ? "Equipe" : "Agente"} · {formatarDataHora(m.criadoEm)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
