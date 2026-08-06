import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../api/client.js";
import { atualizarAgenteConfig, obterAgenteConfig } from "../api/resources.js";

interface FormState {
  nomeDoAgente: string;
  descricaoRestaurante: string;
  tomDeVoz: string;
  saudacao: string;
  despedida: string;
  politicasReserva: string;
  topicosProibidos: string;
}

const VAZIO: FormState = {
  nomeDoAgente: "",
  descricaoRestaurante: "",
  tomDeVoz: "",
  saudacao: "",
  despedida: "",
  politicasReserva: "",
  topicosProibidos: "",
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
      });
      setSalvo(true);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel salvar a configuracao.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return <p>Carregando...</p>;

  return (
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
        {erro && <p className="erro">{erro}</p>}
        {salvo && <p className="sucesso" style={{ fontSize: "0.85rem" }}>Configuracao salva.</p>}
        <button className="btn" type="submit" disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar"}
        </button>
      </form>
    </div>
  );
}
