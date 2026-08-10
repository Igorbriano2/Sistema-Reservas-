import { useEffect, useState, type FormEvent } from "react";
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { ApiError } from "../api/client.js";
import { adicionarUnidade, atualizarUnidade, listarUnidades } from "../api/resources.js";
import { useTheme } from "../context/ThemeContext.js";
import { stripePromise } from "../lib/stripe-client.js";
import type { RedeSocial, Unidade } from "../types.js";

// Stripe Elements roda num iframe isolado e nao le CSS vars (mesma limitacao de
// EtapaPagamento.tsx) - como esta tela (diferente do checkout publico) roda dentro do
// painel com tema claro/escuro alternavel, escolhe as cores fixas conforme o tema
// atual em vez de deixar sempre escuro.
function estiloCartao(tema: "light" | "dark") {
  return {
    style: {
      base: {
        color: tema === "light" ? "#171313" : "#f5efe8",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize: "15px",
        "::placeholder": { color: tema === "light" ? "#6b5c5c" : "rgba(245, 239, 232, 0.4)" },
      },
      invalid: { color: "#9c6b5c" },
    },
  };
}

interface FormularioNovaUnidadeProps {
  onCriada: (unidade: Unidade) => void;
  onCancelar: () => void;
}

// Mini-checkout do doc 17 (parte 3): reaproveita o mesmo cliente Stripe da empresa
// (nunca cria outro), so gera uma NOVA subscription vinculada a essa unidade, com
// trial de 7 dias independente das demais.
function FormularioNovaUnidade({ onCriada, onCancelar }: FormularioNovaUnidadeProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { tema } = useTheme();
  const [nome, setNome] = useState("");
  const [endereco, setEndereco] = useState("");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function criar(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) return;

    setEnviando(true);
    setErro(null);
    try {
      const { error: erroCartao, paymentMethod } = await stripe.createPaymentMethod({ type: "card", card: cardElement });
      if (erroCartao || !paymentMethod) {
        setErro(erroCartao?.message ?? "Nao foi possivel validar o cartao. Confira os dados e tente novamente.");
        return;
      }

      const unidade = await adicionarUnidade({
        nome,
        endereco: endereco.trim() || undefined,
        timezone,
        paymentMethodId: paymentMethod.id,
      });
      onCriada(unidade);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel adicionar a unidade agora. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={criar}>
      <p className="texto-secundario" style={{ marginTop: 0, fontSize: "0.85rem" }}>
        Cada unidade tem sua propria assinatura (R$ 697/mes), com 7 dias grátis de teste independentes das outras.
      </p>
      <div className="linha-form">
        <label>
          Nome da unidade
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Cervegela Maringá" required />
        </label>
        <label>
          Endereço (opcional)
          <input value={endereco} onChange={(e) => setEndereco(e.target.value)} />
        </label>
        <label>
          Fuso horário
          <input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </label>
      </div>
      <label>
        Cartão de crédito
        <div className="checkout-card-element">
          <CardElement options={estiloCartao(tema)} />
        </div>
      </label>
      {erro && <p className="erro">{erro}</p>}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
        <button className="btn" type="submit" disabled={enviando || !stripe}>
          {enviando ? "Adicionando..." : "Adicionar unidade e começar teste grátis"}
        </button>
        <button className="btn btn-secundario" type="button" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

interface FormularioContatoState {
  endereco: string;
  telefone: string;
  contatoUrgenciaNome: string;
  contatoUrgenciaTelefone: string;
  redesSociais: RedeSocial[];
}

function paraFormulario(u: Unidade): FormularioContatoState {
  return {
    endereco: u.endereco ?? "",
    telefone: u.telefone ?? "",
    contatoUrgenciaNome: u.contatoUrgenciaNome ?? "",
    contatoUrgenciaTelefone: u.contatoUrgenciaTelefone ?? "",
    redesSociais: u.redesSociais,
  };
}

// Edicao dos dados de contato/presenca (doc 24) - o agente de IA usa isso pra
// responder endereco/telefone/redes sociais sem inventar (ver agent-prompt.ts).
interface FormularioContatoProps {
  unidade: Unidade;
  onSalvo: (unidade: Unidade) => void;
  onCancelar: () => void;
}

function FormularioContato({ unidade, onSalvo, onCancelar }: FormularioContatoProps) {
  const [form, setForm] = useState<FormularioContatoState>(() => paraFormulario(unidade));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function atualizarRede(indice: number, campo: keyof RedeSocial, valor: string) {
    setForm((atual) => ({
      ...atual,
      redesSociais: atual.redesSociais.map((r, i) => (i === indice ? { ...r, [campo]: valor } : r)),
    }));
  }

  function removerRede(indice: number) {
    setForm((atual) => ({ ...atual, redesSociais: atual.redesSociais.filter((_, i) => i !== indice) }));
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const atualizada = await atualizarUnidade(unidade.id, {
        endereco: form.endereco.trim() || null,
        telefone: form.telefone.trim() || null,
        contatoUrgenciaNome: form.contatoUrgenciaNome.trim() || null,
        contatoUrgenciaTelefone: form.contatoUrgenciaTelefone.trim() || null,
        redesSociais: form.redesSociais.filter((r) => r.rede.trim() && r.link.trim()),
      });
      onSalvo(atualizada);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel salvar. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="cartao">
      <h3 style={{ marginTop: 0 }}>Contato de {unidade.nome}</h3>
      <p className="texto-secundario" style={{ fontSize: "0.85rem" }}>
        O agente de IA usa esses dados pra responder no Instagram/WhatsApp quando o cliente perguntar endereço,
        telefone ou redes sociais - nunca inventa essas informações.
      </p>
      <div className="linha-form">
        <label>
          Endereço
          <input value={form.endereco} onChange={(e) => setForm((f) => ({ ...f, endereco: e.target.value }))} />
        </label>
        <label>
          Telefone
          <input value={form.telefone} onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))} placeholder="(11) 91234-5678" />
        </label>
      </div>
      <p className="texto-secundario" style={{ fontSize: "0.85rem" }}>
        Contato de urgência (opcional): quando o agente encaminha uma conversa pra um humano (reclamação séria,
        pedido explícito de falar com alguém), ele oferece esse contato direto ao cliente como alternativa
        imediata, além de avisar a equipe.
      </p>
      <div className="linha-form">
        <label>
          Nome do contato de urgência
          <input
            value={form.contatoUrgenciaNome}
            onChange={(e) => setForm((f) => ({ ...f, contatoUrgenciaNome: e.target.value }))}
            placeholder="Ex: Carlos (gerente)"
          />
        </label>
        <label>
          Telefone de urgência
          <input
            value={form.contatoUrgenciaTelefone}
            onChange={(e) => setForm((f) => ({ ...f, contatoUrgenciaTelefone: e.target.value }))}
            placeholder="(11) 91234-5678"
          />
        </label>
      </div>
      <label style={{ marginBottom: "0.5rem" }}>Redes sociais</label>
      {form.redesSociais.map((rede, i) => (
        <div className="linha-form" key={i}>
          <input value={rede.rede} onChange={(e) => atualizarRede(i, "rede", e.target.value)} placeholder="Instagram" />
          <input value={rede.link} onChange={(e) => atualizarRede(i, "link", e.target.value)} placeholder="https://instagram.com/..." />
          <button type="button" className="btn btn-secundario" onClick={() => removerRede(i)}>
            Remover
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-secundario"
        onClick={() => setForm((f) => ({ ...f, redesSociais: [...f.redesSociais, { rede: "", link: "" }] }))}
      >
        + Adicionar rede social
      </button>
      {erro && <p className="erro">{erro}</p>}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
        <button className="btn" type="submit" disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar"}
        </button>
        <button className="btn btn-secundario" type="button" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function UnidadesPage() {
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      setUnidades(await listarUnidades());
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel carregar as unidades.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <div>
      {erro && <p className="erro">{erro}</p>}

      <div className="cartao">
        <h3 style={{ marginTop: 0 }}>Lojas da empresa</h3>
        {carregando ? (
          <p>Carregando...</p>
        ) : (
          <div className="tabela-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Endereço</th>
                  <th>Telefone</th>
                  <th>Redes sociais</th>
                  <th>Fuso horário</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {unidades.map((u) => (
                  <tr key={u.id}>
                    <td>{u.nome}</td>
                    <td>{u.endereco ?? "-"}</td>
                    <td>{u.telefone ?? "-"}</td>
                    <td>{u.redesSociais.length > 0 ? u.redesSociais.map((r) => r.rede).join(", ") : "-"}</td>
                    <td>{u.timezone}</td>
                    <td>
                      <button className="btn btn-secundario" type="button" onClick={() => setEditandoId(u.id)}>
                        Editar contato
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editandoId && (
        <FormularioContato
          unidade={unidades.find((u) => u.id === editandoId)!}
          onSalvo={(atualizada) => {
            setUnidades((atual) => atual.map((u) => (u.id === atualizada.id ? atualizada : u)));
            setEditandoId(null);
          }}
          onCancelar={() => setEditandoId(null)}
        />
      )}

      <div className="cartao">
        <h3 style={{ marginTop: 0 }}>Adicionar unidade</h3>
        {!mostrarFormulario ? (
          <button className="btn" type="button" onClick={() => setMostrarFormulario(true)}>
            Adicionar unidade
          </button>
        ) : stripePromise ? (
          <Elements stripe={stripePromise}>
            <FormularioNovaUnidade
              onCriada={(unidade) => {
                setUnidades((atual) => [...atual, unidade]);
                setMostrarFormulario(false);
              }}
              onCancelar={() => setMostrarFormulario(false)}
            />
          </Elements>
        ) : (
          <p className="texto-secundario">O checkout não está configurado neste ambiente.</p>
        )}
      </div>
    </div>
  );
}
