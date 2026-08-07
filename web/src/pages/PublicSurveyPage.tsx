import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { enviarRespostasPesquisa, obterInfoDaPesquisa, type InfoDaPesquisa, type RespostaPesquisa } from "../api/resources.js";
import { Marca } from "../components/Marca.js";

type Estado = "carregando" | "invalido" | "pronto" | "enviada";

export function PublicSurveyPage() {
  const { token } = useParams<{ token: string }>();
  const [estado, setEstado] = useState<Estado>("carregando");
  const [info, setInfo] = useState<InfoDaPesquisa | null>(null);
  const [respostas, setRespostas] = useState<Record<string, RespostaPesquisa>>({});
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setEstado("invalido");
      return;
    }
    obterInfoDaPesquisa(token)
      .then((dados) => {
        setInfo(dados);
        setEstado(dados.jaRespondida ? "enviada" : "pronto");
      })
      .catch(() => setEstado("invalido"));
  }, [token]);

  function definirEscala(perguntaId: string, valorEscala: number) {
    setRespostas((atual) => ({ ...atual, [perguntaId]: { perguntaId, valorEscala } }));
  }

  function definirTexto(perguntaId: string, valorTexto: string) {
    setRespostas((atual) => ({ ...atual, [perguntaId]: { perguntaId, valorTexto } }));
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!token || !info) return;
    const lista = info.perguntas
      .map((p) => respostas[p.id])
      .filter((r): r is RespostaPesquisa => !!r && (r.valorEscala != null || !!r.valorTexto?.trim()));
    if (lista.length === 0) {
      setErro("Responda pelo menos uma pergunta.");
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      await enviarRespostasPesquisa(token, lista);
      setEstado("enviada");
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel enviar suas respostas. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  if (estado === "carregando") {
    return (
      <div className="tela-login">
        <p>Carregando...</p>
      </div>
    );
  }

  if (estado === "invalido") {
    return (
      <div className="tela-login">
        <div className="form-login">
          <Marca tamanho="grande" />
          <h1 style={{ margin: 0, fontSize: "1.1rem" }}>Link expirado</h1>
          <p className="texto-secundario" style={{ fontSize: "0.9rem" }}>
            Este link de pesquisa expirou ou é inválido.
          </p>
        </div>
      </div>
    );
  }

  if (estado === "enviada") {
    return (
      <div className="tela-login">
        <div className="form-login">
          <Marca tamanho="grande" />
          <h1 style={{ margin: 0, fontSize: "1.1rem" }}>Obrigado pela sua resposta!</h1>
          <p className="texto-secundario" style={{ fontSize: "0.9rem" }}>Sua opinião ajuda {info?.unidadeNome} a melhorar.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tela-login">
      <form className="form-login" onSubmit={enviar} style={{ width: 360 }}>
        <Marca tamanho="grande" />
        <h1 style={{ margin: 0, fontSize: "1.1rem" }}>Como foi sua experiência em {info?.unidadeNome}?</h1>
        {info?.perguntas.map((pergunta) => (
          <label key={pergunta.id}>
            {pergunta.texto}
            {pergunta.tipo === "escala" ? (
              <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem" }}>
                {[1, 2, 3, 4, 5].map((nota) => (
                  <button
                    key={nota}
                    type="button"
                    className={`btn ${respostas[pergunta.id]?.valorEscala === nota ? "" : "btn-secundario"}`}
                    style={{ flex: 1, padding: "0.5rem 0" }}
                    onClick={() => definirEscala(pergunta.id, nota)}
                  >
                    {nota}
                  </button>
                ))}
              </div>
            ) : (
              <input value={respostas[pergunta.id]?.valorTexto ?? ""} onChange={(e) => definirTexto(pergunta.id, e.target.value)} />
            )}
          </label>
        ))}
        {erro && <span className="erro">{erro}</span>}
        <button className="btn" type="submit" disabled={enviando}>
          {enviando ? "Enviando..." : "Enviar resposta"}
        </button>
      </form>
    </div>
  );
}
