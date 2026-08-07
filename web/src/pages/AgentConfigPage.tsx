import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { atualizarAgenteConfig, obterAgenteConfig, obterConexaoInstagram, urlConectarInstagram } from "../api/resources.js";
import type { InstagramConnection } from "../types.js";

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

interface FormState {
  nomeDoAgente: string;
  descricaoRestaurante: string;
  tomDeVoz: string;
  saudacao: string;
  despedida: string;
  politicasReserva: string;
  topicosProibidos: string;
  googleTagId: string;
  facebookPixelId: string;
}

const VAZIO: FormState = {
  nomeDoAgente: "",
  descricaoRestaurante: "",
  tomDeVoz: "",
  saudacao: "",
  despedida: "",
  politicasReserva: "",
  topicosProibidos: "",
  googleTagId: "",
  facebookPixelId: "",
};

export function AgentConfigPage() {
  const [form, setForm] = useState<FormState>(VAZIO);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    obterAgenteConfig()
      .then((config) =>
        setForm({
          nomeDoAgente: config.nomeDoAgente,
          descricaoRestaurante: config.descricaoRestaurante,
          tomDeVoz: config.tomDeVoz,
          saudacao: config.saudacao,
          despedida: config.despedida,
          politicasReserva: config.politicasReserva,
          topicosProibidos: config.topicosProibidos.join(", "),
          googleTagId: config.googleTagId ?? "",
          facebookPixelId: config.facebookPixelId ?? "",
        }),
      )
      .catch((err) => setErro(err instanceof ApiError ? err.message : "Nao foi possivel carregar a configuracao."))
      .finally(() => setCarregando(false));
  }, []);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    setSalvo(false);
    try {
      await atualizarAgenteConfig({
        nomeDoAgente: form.nomeDoAgente,
        descricaoRestaurante: form.descricaoRestaurante,
        tomDeVoz: form.tomDeVoz,
        saudacao: form.saudacao,
        despedida: form.despedida,
        politicasReserva: form.politicasReserva,
        topicosProibidos: form.topicosProibidos
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        googleTagId: form.googleTagId,
        facebookPixelId: form.facebookPixelId,
      });
      setSalvo(true);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel salvar a configuracao.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <>
        <ConexaoInstagram />
        <p>Carregando...</p>
      </>
    );
  }

  return (
    <>
    <ConexaoInstagram />
    <div className="cartao">
      <h3 style={{ marginTop: 0 }}>Personalizacao do agente de IA</h3>
      <p className="texto-secundario" style={{ marginTop: 0, fontSize: "0.85rem" }}>
        Isso define como o assistente se comporta ao conversar com clientes pelo Instagram Direct.
      </p>
      <form onSubmit={salvar}>
        <div className="linha-form">
          <label>
            Nome do agente
            <input value={form.nomeDoAgente} onChange={(e) => setForm({ ...form, nomeDoAgente: e.target.value })} required />
          </label>
          <label>
            Tom de voz
            <input value={form.tomDeVoz} onChange={(e) => setForm({ ...form, tomDeVoz: e.target.value })} />
          </label>
        </div>
        <label style={{ marginBottom: "0.75rem" }}>
          Descricao do restaurante
          <textarea rows={2} value={form.descricaoRestaurante} onChange={(e) => setForm({ ...form, descricaoRestaurante: e.target.value })} />
        </label>
        <div className="linha-form">
          <label>
            Saudacao
            <input value={form.saudacao} onChange={(e) => setForm({ ...form, saudacao: e.target.value })} />
          </label>
          <label>
            Despedida
            <input value={form.despedida} onChange={(e) => setForm({ ...form, despedida: e.target.value })} />
          </label>
        </div>
        <label style={{ marginBottom: "0.75rem" }}>
          Politicas de reserva
          <textarea rows={3} value={form.politicasReserva} onChange={(e) => setForm({ ...form, politicasReserva: e.target.value })} />
        </label>
        <label style={{ marginBottom: "0.75rem" }}>
          Topicos proibidos (separados por virgula)
          <input value={form.topicosProibidos} onChange={(e) => setForm({ ...form, topicosProibidos: e.target.value })} />
        </label>

        <hr style={{ border: "none", borderTop: "1px solid var(--border-subtle)", margin: "1.25rem 0" }} />
        <h4 style={{ marginTop: 0, marginBottom: "0.25rem" }}>Rastreamento de marketing</h4>
        <p className="texto-secundario" style={{ marginTop: 0, marginBottom: "0.75rem", fontSize: "0.85rem" }}>
          Opcional. Cole os ids das suas proprias campanhas pra ver no Google Ads/Meta Ads quantas reservas elas
          geraram. So carregamos os scripts na pagina publica de reserva depois que o cliente aceitar cookies.
        </p>
        <div className="linha-form">
          <label>
            Google Tag ID
            <input
              value={form.googleTagId}
              onChange={(e) => setForm({ ...form, googleTagId: e.target.value })}
              placeholder="G-XXXXXXXXXX ou AW-XXXXXXXXX"
            />
            <span className="texto-secundario" style={{ fontSize: "0.78rem", fontWeight: 400 }}>
              Google Tag Manager ou GA4 → Admin → Fluxos de dados
            </span>
          </label>
          <label>
            Facebook Pixel ID
            <input
              value={form.facebookPixelId}
              onChange={(e) => setForm({ ...form, facebookPixelId: e.target.value })}
              placeholder="Somente numeros"
            />
            <span className="texto-secundario" style={{ fontSize: "0.78rem", fontWeight: 400 }}>
              Meta Events Manager → Origens de dados → Pixel
            </span>
          </label>
        </div>

        {erro && <p className="erro">{erro}</p>}
        {salvo && <p className="sucesso" style={{ fontSize: "0.85rem" }}>Configuracao salva.</p>}
        <button className="btn" type="submit" disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar"}
        </button>
      </form>
    </div>
    </>
  );
}
