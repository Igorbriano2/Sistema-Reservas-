import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import { ApiError } from "../api/client.js";
import {
  definirAgentePausado,
  enviarMensagemConversa,
  listarConversas,
  listarMensagensDaConversa,
  obterConexaoInstagram,
  urlConectarInstagram,
} from "../api/resources.js";
import type { Conversa, InstagramConnection, Mensagem } from "../types.js";

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const MENSAGENS_ERRO_INSTAGRAM: Record<string, string> = {
  nao_autorizado: "Voce precisa ser o dono da empresa pra conectar o Instagram.",
  nao_configurado: "A conexao self-service com o Instagram ainda nao foi configurada. Use o comando manual por enquanto.",
  cancelado: "Voce cancelou o login com o Instagram antes de terminar.",
  parametros_invalidos: "Resposta invalida da Meta. Tente novamente.",
  state_invalido: "A tentativa de conexao expirou ou e invalida. Tente novamente.",
  falha_troca_token: "Nao foi possivel concluir a conexao com o Instagram. Tente novamente em alguns minutos.",
};

// Doc 14 - conexao self-service via OAuth (Meta Login for Business), alternativa ao
// comando manual instagram:connect (os dois coexistem, gravam na mesma tabela).
function ConexaoInstagram() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [conexao, setConexao] = useState<InstagramConnection | null>(null);
  const [carregando, setCarregando] = useState(true);
  // Capturado uma unica vez na montagem (nao lido direto de searchParams em todo
  // render): assim que limpamos a URL logo abaixo, um `.get()` ao vivo voltaria null
  // e o aviso sumiria no mesmo instante em que apareceu.
  const [avisoConectado, setAvisoConectado] = useState(false);
  const [codigoErro, setCodigoErro] = useState<string | null>(null);

  function carregar() {
    setCarregando(true);
    obterConexaoInstagram()
      .then(setConexao)
      .catch(() => setConexao(null))
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    carregar();

    const conectado = searchParams.get("instagram_conectado") === "1";
    const erro = searchParams.get("instagram_erro");
    if (conectado || erro) {
      setAvisoConectado(conectado);
      setCodigoErro(erro);
      // Limpa os query params depois de ler, pra um refresh nao mostrar o aviso de novo.
      const proximo = new URLSearchParams(searchParams);
      proximo.delete("instagram_conectado");
      proximo.delete("instagram_erro");
      setSearchParams(proximo, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conectado = conexao?.conectado && conexao.status === "ativo";
  const expirado = conexao?.conectado && conexao.status === "expirada";

  return (
    <div className="cartao">
      <h3 style={{ marginTop: 0 }}>Conexao com o Instagram</h3>
      <p className="texto-secundario" style={{ marginTop: 0, fontSize: "0.85rem" }}>
        Conecte a conta comercial do Instagram do restaurante pra o agente de IA conseguir responder no Direct.
      </p>

      {avisoConectado && <p className="sucesso" style={{ fontSize: "0.85rem" }}>Instagram conectado com sucesso!</p>}
      {codigoErro && (
        <p className="erro">{MENSAGENS_ERRO_INSTAGRAM[codigoErro] ?? "Nao foi possivel conectar o Instagram. Tente novamente."}</p>
      )}

      {carregando ? (
        <p>Carregando...</p>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {conectado ? (
            <span className="badge badge-confirmada">Conectado ✅ {conexao?.handle ? `@${conexao.handle}` : ""}</span>
          ) : expirado ? (
            <span className="badge badge-pendente">Conexao expirada</span>
          ) : (
            <span className="badge badge-cancelada">Desconectado</span>
          )}
          <a className="btn btn-secundario" href={urlConectarInstagram()}>
            {conectado ? "Reconectar" : expirado ? "Reconectar" : "Conectar Instagram"}
          </a>
        </div>
      )}
    </div>
  );
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

  const [textoResposta, setTextoResposta] = useState("");
  const [enviandoResposta, setEnviandoResposta] = useState(false);

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
    setTextoResposta("");
    setCarregandoMensagens(true);
    try {
      setMensagens(await listarMensagensDaConversa(unidade.id, conversa.id));
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível carregar as mensagens.");
    } finally {
      setCarregandoMensagens(false);
    }
  }

  async function enviarResposta(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!unidade || !conversaAberta || !textoResposta.trim()) return;
    setEnviandoResposta(true);
    setErro(null);
    try {
      const mensagem = await enviarMensagemConversa(unidade.id, conversaAberta.id, textoResposta.trim());
      setMensagens((lista) => [...lista, mensagem]);
      setTextoResposta("");
      // Enviar pausa o agente automaticamente no backend - reflete isso aqui tambem,
      // sem precisar recarregar a lista inteira so pra atualizar um badge.
      setConversaAberta((atual) => (atual ? { ...atual, agentPaused: true } : atual));
      setConversas((lista) => lista.map((c) => (c.id === conversaAberta.id ? { ...c, agentPaused: true } : c)));
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível enviar a resposta.");
    } finally {
      setEnviandoResposta(false);
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
      <ConexaoInstagram />
      {erro && <p className="erro">{erro}</p>}
      <div className="cartao">
        <h3 style={{ marginTop: 0 }}>Conversas do Instagram</h3>
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
          <form onSubmit={enviarResposta} style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
            <textarea
              value={textoResposta}
              onChange={(e) => setTextoResposta(e.target.value)}
              placeholder="Escreva a resposta e envie direto pro Instagram do cliente..."
              rows={2}
              style={{ flex: 1, resize: "vertical" }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button className="btn" type="submit" disabled={enviandoResposta || !textoResposta.trim()} style={{ alignSelf: "flex-end" }}>
              {enviandoResposta ? "Enviando..." : "Enviar"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
