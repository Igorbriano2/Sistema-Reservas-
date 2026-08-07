import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext.js";
import { ApiError } from "../api/client.js";
import {
  atualizarPesquisaPergunta,
  atualizarWhatsappConfig,
  criarPesquisaPergunta,
  excluirPesquisaPergunta,
  listarConexoesWhatsapp,
  listarFeedbacks,
  listarPesquisaPerguntas,
  obterWhatsappConfig,
} from "../api/resources.js";
import type { Feedback, PesquisaPergunta, PesquisaPerguntaTipo, WhatsappConfig, WhatsappConnection } from "../types.js";

const TIPO_PERGUNTA_LABEL: Record<PesquisaPerguntaTipo, string> = {
  escala: "Nota de 1 a 5",
  texto_curto: "Texto curto",
};

// NPS customizavel (doc 21) - quando o dono cria pelo menos uma pergunta ativa, o
// link da pesquisa passa a ir junto do template de feedback por WhatsApp, no lugar
// do fluxo fixo de "responda com uma nota de 1 a 5".
function PesquisaCustomizada() {
  const [perguntas, setPerguntas] = useState<PesquisaPergunta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [tipo, setTipo] = useState<PesquisaPerguntaTipo>("escala");
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    setCarregando(true);
    try {
      setPerguntas(await listarPesquisaPerguntas());
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel carregar as perguntas.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function adicionar(e: FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    setSalvando(true);
    try {
      await criarPesquisaPergunta({ tipo, texto: texto.trim() });
      setTexto("");
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel criar a pergunta.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtiva(pergunta: PesquisaPergunta) {
    try {
      await atualizarPesquisaPergunta(pergunta.id, { ativa: !pergunta.ativa });
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel atualizar a pergunta.");
    }
  }

  async function excluir(pergunta: PesquisaPergunta) {
    if (!confirm(`Excluir a pergunta "${pergunta.texto}"?`)) return;
    try {
      await excluirPesquisaPergunta(pergunta.id);
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel excluir a pergunta.");
    }
  }

  return (
    <div className="cartao">
      <h3 style={{ marginTop: 0 }}>Pesquisa de satisfação (NPS customizável)</h3>
      <p className="texto-secundario" style={{ marginTop: 0, fontSize: "0.85rem" }}>
        Por padrão, o pedido de feedback pede uma nota de 1 a 5 por resposta livre no WhatsApp. Se você cadastrar
        pelo menos uma pergunta ativa aqui, o cliente recebe um link com sua própria pesquisa (várias perguntas, do
        tipo nota ou texto curto).
      </p>
      {erro && <p className="erro">{erro}</p>}
      <form className="linha-form" onSubmit={adicionar}>
        <label>
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value as PesquisaPerguntaTipo)}>
            <option value="escala">Nota de 1 a 5</option>
            <option value="texto_curto">Texto curto</option>
          </select>
        </label>
        <label style={{ flex: 1 }}>
          Pergunta
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex: O que podemos melhorar?" required />
        </label>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button className="btn" type="submit" disabled={salvando}>
            Adicionar pergunta
          </button>
        </div>
      </form>
      {carregando ? (
        <p>Carregando...</p>
      ) : perguntas.length === 0 ? (
        <p className="texto-secundario">Nenhuma pergunta customizada ainda (a pesquisa padrão continua ativa).</p>
      ) : (
        <table style={{ marginTop: "1rem" }}>
          <thead>
            <tr>
              <th>Pergunta</th>
              <th>Tipo</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {perguntas.map((p) => (
              <tr key={p.id}>
                <td>{p.texto}</td>
                <td>{TIPO_PERGUNTA_LABEL[p.tipo]}</td>
                <td>
                  <span className={`badge ${p.ativa ? "badge-confirmada" : "badge-cancelada"}`}>{p.ativa ? "Ativa" : "Desativada"}</span>
                </td>
                <td>
                  <div className="acoes">
                    <button className="btn btn-secundario" onClick={() => alternarAtiva(p)}>
                      {p.ativa ? "Desativar" : "Ativar"}
                    </button>
                    <button className="btn btn-perigo" onClick={() => excluir(p)}>
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

interface FormConfig {
  feedbackAtivo: boolean;
  aniversarioAtivo: boolean;
  recuperacaoAtivo: boolean;
  textoAniversario: string;
  textoRecuperacao: string;
  diasInatividadeRecuperacao: string;
}

function paraForm(config: WhatsappConfig): FormConfig {
  return {
    feedbackAtivo: config.feedbackAtivo,
    aniversarioAtivo: config.aniversarioAtivo,
    recuperacaoAtivo: config.recuperacaoAtivo,
    textoAniversario: config.textoAniversario ?? "",
    textoRecuperacao: config.textoRecuperacao ?? "",
    diasInatividadeRecuperacao: String(config.diasInatividadeRecuperacao),
  };
}

function ConexaoWhatsapp() {
  const [conexoes, setConexoes] = useState<WhatsappConnection[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    listarConexoesWhatsapp()
      .then(setConexoes)
      .catch((err) => setErro(err instanceof ApiError ? err.message : "Nao foi possivel carregar a conexao."))
      .finally(() => setCarregando(false));
  }, []);

  return (
    <div className="cartao">
      <h3 style={{ marginTop: 0 }}>Conexao com o WhatsApp</h3>
      <p className="texto-secundario" style={{ marginTop: 0, fontSize: "0.85rem" }}>
        A conexao e feita pela equipe tecnica, colando o token de acesso do WhatsApp Business API da sua empresa
        (mesmo processo usado para o Instagram). Aqui voce so acompanha o status.
      </p>
      {carregando ? (
        <p>Carregando...</p>
      ) : erro ? (
        <p className="erro">{erro}</p>
      ) : conexoes.length === 0 ? (
        <p className="texto-secundario">
          <span className="badge badge-cancelada">Desconectado</span> Nenhum numero de WhatsApp conectado ainda.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Numero (Phone Number ID)</th>
              <th>Status</th>
              <th>Conectado em</th>
            </tr>
          </thead>
          <tbody>
            {conexoes.map((c) => (
              <tr key={c.id}>
                <td>{c.phoneNumberId}</td>
                <td>
                  <span className={`badge ${c.status === "ativo" ? "badge-confirmada" : "badge-cancelada"}`}>
                    {c.status === "ativo" ? "Conectado" : "Desconectado"}
                  </span>
                </td>
                <td>{new Date(c.conectadoEm).toLocaleDateString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ConfigCampanhas() {
  const [form, setForm] = useState<FormConfig | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    obterWhatsappConfig()
      .then((config) => setForm(paraForm(config)))
      .catch((err) => setErro(err instanceof ApiError ? err.message : "Nao foi possivel carregar a configuracao."))
      .finally(() => setCarregando(false));
  }, []);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSalvando(true);
    setErro(null);
    setSalvo(false);
    try {
      const config = await atualizarWhatsappConfig({
        feedbackAtivo: form.feedbackAtivo,
        aniversarioAtivo: form.aniversarioAtivo,
        recuperacaoAtivo: form.recuperacaoAtivo,
        textoAniversario: form.textoAniversario,
        textoRecuperacao: form.textoRecuperacao,
        diasInatividadeRecuperacao: Number(form.diasInatividadeRecuperacao),
      });
      setForm(paraForm(config));
      setSalvo(true);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel salvar a configuracao.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return <div className="cartao">Carregando...</div>;
  if (!form) return <div className="cartao">{erro ?? "Nao foi possivel carregar."}</div>;

  return (
    <div className="cartao">
      <h3 style={{ marginTop: 0 }}>Campanhas automaticas</h3>
      <p className="texto-secundario" style={{ marginTop: 0, fontSize: "0.85rem" }}>
        Cada campanha so e enviada para clientes que aceitaram receber novidades por WhatsApp (opt-in feito na
        pagina publica de reserva).
      </p>
      <form onSubmit={salvar}>
        <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
          <input
            type="checkbox"
            style={{ width: "auto" }}
            checked={form.feedbackAtivo}
            onChange={(e) => setForm({ ...form, feedbackAtivo: e.target.checked })}
          />
          <span>
            <strong>Pedido de feedback</strong>
            <span className="texto-secundario"> - no dia seguinte a reserva concluida</span>
          </span>
        </label>

        <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem" }}>
          <input
            type="checkbox"
            style={{ width: "auto" }}
            checked={form.aniversarioAtivo}
            onChange={(e) => setForm({ ...form, aniversarioAtivo: e.target.checked })}
          />
          <span>
            <strong>Mensagem de aniversario</strong>
          </span>
        </label>
        <label style={{ marginTop: "0.5rem", marginBottom: "0.75rem" }}>
          Texto customizado (opcional)
          <input
            value={form.textoAniversario}
            onChange={(e) => setForm({ ...form, textoAniversario: e.target.value })}
            placeholder="Feliz aniversario! A gente tem uma surpresa pra voce hoje."
          />
        </label>

        <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
          <input
            type="checkbox"
            style={{ width: "auto" }}
            checked={form.recuperacaoAtivo}
            onChange={(e) => setForm({ ...form, recuperacaoAtivo: e.target.checked })}
          />
          <span>
            <strong>Recuperacao de cliente inativo</strong>
          </span>
        </label>
        <div className="linha-form" style={{ marginTop: "0.5rem" }}>
          <label>
            Texto customizado (opcional)
            <input
              value={form.textoRecuperacao}
              onChange={(e) => setForm({ ...form, textoRecuperacao: e.target.value })}
              placeholder="Sentimos sua falta! Que tal reservar uma mesa?"
            />
          </label>
          <label>
            Dias de inatividade para disparar
            <input
              type="number"
              min={1}
              value={form.diasInatividadeRecuperacao}
              onChange={(e) => setForm({ ...form, diasInatividadeRecuperacao: e.target.value })}
            />
          </label>
        </div>

        {erro && <p className="erro">{erro}</p>}
        {salvo && <p className="sucesso" style={{ fontSize: "0.85rem" }}>Configuracao salva.</p>}
        <button className="btn" type="submit" disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar"}
        </button>
      </form>
    </div>
  );
}

function ListaFeedbacks() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    listarFeedbacks()
      .then(setFeedbacks)
      .catch((err) => setErro(err instanceof ApiError ? err.message : "Nao foi possivel carregar os feedbacks."))
      .finally(() => setCarregando(false));
  }, []);

  return (
    <div className="cartao">
      <h3 style={{ marginTop: 0 }}>Feedbacks recebidos</h3>
      {carregando ? (
        <p>Carregando...</p>
      ) : erro ? (
        <p className="erro">{erro}</p>
      ) : feedbacks.length === 0 ? (
        <p className="texto-secundario">Nenhum feedback recebido ainda.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Reserva</th>
              <th>Respostas</th>
              <th>Recebido em</th>
            </tr>
          </thead>
          <tbody>
            {feedbacks.map((f) => (
              <tr key={f.id}>
                <td>{f.clienteNome}</td>
                <td>
                  {f.reservaData.split("-").reverse().join("/")} as {f.reservaHoraInicio.slice(0, 5)}
                  <div className="texto-secundario" style={{ fontSize: "0.8rem" }}>{f.unidadeNome}</div>
                </td>
                <td>
                  {f.respostasCustomizadas.length > 0 ? (
                    f.respostasCustomizadas.map((r, i) => (
                      <div key={i} style={{ fontSize: "0.85rem", marginBottom: "0.2rem" }}>
                        <span className="texto-secundario">{r.perguntaTexto}:</span>{" "}
                        {r.valorEscala != null ? `${r.valorEscala} / 5` : r.valorTexto}
                      </div>
                    ))
                  ) : (
                    <>
                      {f.nota != null && <div>Nota: {f.nota} / 5</div>}
                      {f.comentarioTexto && <div className="texto-secundario" style={{ fontSize: "0.85rem" }}>{f.comentarioTexto}</div>}
                      {f.nota == null && !f.comentarioTexto && "-"}
                    </>
                  )}
                </td>
                <td>{new Date(f.recebidoEm).toLocaleDateString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function WhatsAppPage() {
  const { isOwner } = useAuth();
  return (
    <div>
      {isOwner && <ConexaoWhatsapp />}
      {isOwner && <ConfigCampanhas />}
      {isOwner && <PesquisaCustomizada />}
      <ListaFeedbacks />
    </div>
  );
}
