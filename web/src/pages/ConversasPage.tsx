import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import { useEhMobile } from "../lib/useEhMobile.js";
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

// Hoje mostra so a hora (HH:MM, igual WhatsApp/Instagram); outro dia mostra dd/mm.
function formatarHoraLista(iso: string): string {
  const data = new Date(iso);
  const hoje = new Date();
  const ehHoje = data.toDateString() === hoje.toDateString();
  return ehHoje
    ? data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const MENSAGENS_ERRO_INSTAGRAM: Record<string, string> = {
  nao_autorizado: "Voce precisa ser o dono da empresa pra conectar o Instagram.",
  nao_configurado: "A conexao self-service com o Instagram ainda nao foi configurada. Use o comando manual por enquanto.",
  cancelado: "Voce cancelou o login com o Instagram antes de terminar.",
  parametros_invalidos: "Resposta invalida da Meta. Tente novamente.",
  state_invalido: "A tentativa de conexao expirou ou e invalida. Tente novamente.",
  falha_troca_token: "Nao foi possivel concluir a conexao com o Instagram. Tente novamente em alguns minutos.",
};

// Circulo com a foto do Instagram - ou, sem foto (ou se o link expirou/quebrou), a
// inicial do nome/ID como fallback, igual qualquer app de chat.
function Avatar({ nome, foto, tamanho = 44 }: { nome: string | null; foto: string | null; tamanho?: number }) {
  const [erro, setErro] = useState(false);
  const estilo = { width: tamanho, height: tamanho, flexShrink: 0 };
  if (foto && !erro) {
    return (
      <img
        src={foto}
        alt=""
        style={{ ...estilo, borderRadius: "50%", objectFit: "cover" }}
        onError={() => setErro(true)}
      />
    );
  }
  return (
    <div className="chat-avatar-iniciais" style={{ ...estilo, fontSize: tamanho * 0.42 }}>
      {(nome ?? "?").trim().charAt(0).toUpperCase()}
    </div>
  );
}

// Doc 14 - conexao self-service via OAuth (Meta Login for Business), alternativa ao
// comando manual instagram:connect (os dois coexistem, gravam na mesma tabela). Doc 34
// - vira uma faixa compacta (so o essencial) pra abrir espaco pro chat, que e o que a
// equipe do restaurante usa no dia a dia; os detalhes ficam atras de "Detalhes".
function ConexaoInstagram() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [conexao, setConexao] = useState<InstagramConnection | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [expandido, setExpandido] = useState(false);
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
      setExpandido(true);
      const proximo = new URLSearchParams(searchParams);
      proximo.delete("instagram_conectado");
      proximo.delete("instagram_erro");
      setSearchParams(proximo, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conectado = conexao?.conectado && conexao.status === "ativo";
  const expirado = conexao?.conectado && conexao.status === "expirada";

  if (carregando) return null;

  return (
    <div className="chat-conexao-faixa">
      <div className="chat-conexao-faixa-linha">
        {conectado ? (
          <span className="badge badge-confirmada">Instagram conectado {conexao?.handle ? `· @${conexao.handle}` : ""}</span>
        ) : expirado ? (
          <span className="badge badge-pendente">Conexao do Instagram expirada</span>
        ) : (
          <span className="badge badge-cancelada">Instagram desconectado</span>
        )}
        <button type="button" className="btn btn-secundario btn-compacto" onClick={() => setExpandido((e) => !e)}>
          {expandido ? "Ocultar" : "Detalhes"}
        </button>
      </div>
      {expandido && (
        <div className="chat-conexao-faixa-detalhes">
          {avisoConectado && <p className="sucesso" style={{ fontSize: "0.85rem" }}>Instagram conectado com sucesso!</p>}
          {codigoErro && (
            <p className="erro">{MENSAGENS_ERRO_INSTAGRAM[codigoErro] ?? "Nao foi possivel conectar o Instagram. Tente novamente."}</p>
          )}
          <p className="texto-secundario" style={{ margin: "0 0 0.5rem", fontSize: "0.85rem" }}>
            Conecte a conta comercial do Instagram do restaurante pra o agente de IA conseguir responder no Direct.
          </p>
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
  const ehMobile = useEhMobile();
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [somentePausadas, setSomentePausadas] = useState(true);

  const [conversaAbertaId, setConversaAbertaId] = useState<string | null>(null);
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

  const conversaAberta = conversas.find((c) => c.id === conversaAbertaId) ?? null;

  async function abrirConversa(conversa: Conversa) {
    if (!unidade) return;
    setConversaAbertaId(conversa.id);
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
      // sem precisar recarregar a lista inteira so pra atualizar um badge/preview.
      setConversas((lista) =>
        lista.map((c) =>
          c.id === conversaAberta.id
            ? { ...c, agentPaused: true, ultimaMensagem: mensagem.conteudo, ultimaMensagemEm: mensagem.criadoEm }
            : c,
        ),
      );
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
      setConversas((lista) => lista.map((c) => (c.id === atualizada.id ? { ...c, ...atualizada } : c)));
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível reativar o agente.");
    } finally {
      setReativando(false);
    }
  }

  if (!unidade) return <p>Carregando unidade...</p>;

  const listaFiltrada = somentePausadas ? conversas.filter((c) => c.agentPaused) : conversas;
  // Mobile: master-detail - so um painel por vez (lista OU chat aberto), igual
  // WhatsApp/Instagram no celular. Desktop mostra os dois lado a lado sempre.
  const mostrarListaNoMobile = !ehMobile || !conversaAberta;
  const mostrarChatNoMobile = !ehMobile || !!conversaAberta;

  return (
    <div className="chat-instagram">
      <ConexaoInstagram />
      {erro && <p className="erro">{erro}</p>}

      <div className="chat-instagram-corpo">
        {mostrarListaNoMobile && (
          <aside className="chat-lista">
            <div className="chat-lista-cabecalho">
              <h3 style={{ margin: 0 }}>Conversas</h3>
              <label className="chat-filtro-pausadas">
                <input type="checkbox" checked={somentePausadas} onChange={(e) => setSomentePausadas(e.target.checked)} />
                Só aguardando
              </label>
            </div>

            {carregando ? (
              <p className="texto-secundario" style={{ padding: "0 1rem" }}>
                Carregando...
              </p>
            ) : listaFiltrada.length === 0 ? (
              <p className="texto-secundario" style={{ padding: "0 1rem" }}>
                {somentePausadas ? "Nenhuma conversa aguardando atendimento no momento." : "Nenhuma conversa ainda."}
              </p>
            ) : (
              <div className="chat-lista-itens">
                {listaFiltrada.map((conversa) => (
                  <button
                    key={conversa.id}
                    type="button"
                    className={`chat-item ${conversa.id === conversaAbertaId ? "ativo" : ""}`}
                    onClick={() => abrirConversa(conversa)}
                  >
                    <Avatar nome={conversa.nomeCliente} foto={conversa.fotoClienteUrl} />
                    <div className="chat-item-info">
                      <div className="chat-item-linha1">
                        <span className="chat-item-nome">{conversa.nomeCliente ?? conversa.igSenderId}</span>
                        {conversa.ultimaMensagemEm && (
                          <span className="chat-item-hora">{formatarHoraLista(conversa.ultimaMensagemEm)}</span>
                        )}
                      </div>
                      <div className="chat-item-linha2">
                        <span className="chat-item-preview">{conversa.ultimaMensagem ?? "Sem mensagens ainda"}</span>
                        {conversa.agentPaused && <span className="chat-item-badge">Aguardando</span>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </aside>
        )}

        {mostrarChatNoMobile && (
          <section className="chat-painel">
            {!conversaAberta ? (
              <div className="chat-painel-vazio">
                <p className="texto-secundario">Selecione uma conversa à esquerda para ver as mensagens.</p>
              </div>
            ) : (
              <>
                <div className="chat-painel-cabecalho">
                  {ehMobile && (
                    <button type="button" className="chat-voltar" onClick={() => setConversaAbertaId(null)} aria-label="Voltar">
                      ←
                    </button>
                  )}
                  <Avatar nome={conversaAberta.nomeCliente} foto={conversaAberta.fotoClienteUrl} tamanho={38} />
                  <div style={{ flex: 1 }}>
                    <div className="chat-painel-nome">{conversaAberta.nomeCliente ?? conversaAberta.igSenderId}</div>
                    <div className="texto-secundario" style={{ fontSize: "0.78rem" }}>
                      {conversaAberta.agentPaused ? "Aguardando atendimento humano" : "Agente de IA ativo"}
                    </div>
                  </div>
                  {conversaAberta.agentPaused && (
                    <button className="btn btn-secundario btn-compacto" onClick={reativarAgente} disabled={reativando}>
                      {reativando ? "Reativando..." : "Reativar agente"}
                    </button>
                  )}
                </div>

                <div className="chat-painel-mensagens">
                  {carregandoMensagens ? (
                    <p>Carregando mensagens...</p>
                  ) : (
                    mensagens.map((m) => (
                      <div key={m.id} className={`chat-bolha ${m.papel === "user" ? "chat-bolha-cliente" : "chat-bolha-nossa"}`}>
                        <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{m.conteudo}</p>
                        <p className="chat-bolha-meta">
                          {m.papel === "user" ? "Cliente" : m.enviadoPorHumano ? "Equipe" : "Agente"} · {formatarDataHora(m.criadoEm)}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={enviarResposta} className="chat-painel-form">
                  <textarea
                    value={textoResposta}
                    onChange={(e) => setTextoResposta(e.target.value)}
                    placeholder="Escreva a resposta e envie direto pro Instagram do cliente..."
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        e.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                  <button className="btn" type="submit" disabled={enviandoResposta || !textoResposta.trim()}>
                    {enviandoResposta ? "Enviando..." : "Enviar"}
                  </button>
                </form>
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
