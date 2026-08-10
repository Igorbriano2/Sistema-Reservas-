import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../api/client.js";
import { atualizarWhatsappConfig, obterWhatsappConfig } from "../api/resources.js";
import type { WhatsappConfig } from "../types.js";

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

export function CampanhasPage() {
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
        Disparadas por WhatsApp. Cada campanha so e enviada para clientes que aceitaram receber novidades (opt-in
        feito na pagina publica de reserva).
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
