import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext.js";
import { ApiError } from "../api/client.js";
import {
  atualizarPesquisaPergunta,
  criarPesquisaPergunta,
  excluirPesquisaPergunta,
  listarFeedbacks,
  listarPesquisaPerguntas,
} from "../api/resources.js";
import type { Feedback, PesquisaPergunta, PesquisaPerguntaTipo } from "../types.js";

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
        <div className="tabela-scroll">
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
        </div>
      )}
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
        <div className="tabela-scroll">
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
        </div>
      )}
    </div>
  );
}

export function FeedbackPage() {
  const { isOwner } = useAuth();
  return (
    <div>
      {isOwner && <PesquisaCustomizada />}
      <ListaFeedbacks />
    </div>
  );
}
