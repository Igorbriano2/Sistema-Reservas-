import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.js";
import { ApiError } from "../api/client.js";
import { criarMesa, criarSalao, excluirMesa, listarMesas, listarSaloes } from "../api/resources.js";
import type { Mesa, MesaFormato, Salao } from "../types.js";

const FORMATOS: MesaFormato[] = ["redonda", "quadrada", "retangular"];

export function TablesPage() {
  const { unidade } = useAuth();
  const [saloes, setSaloes] = useState<Salao[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [novoSalao, setNovoSalao] = useState("");
  const [salvandoSalao, setSalvandoSalao] = useState(false);

  const [formMesa, setFormMesa] = useState({
    salaoId: "",
    nome: "",
    capacidadeMin: "1",
    capacidadeMax: "4",
    formato: "redonda" as MesaFormato,
  });
  const [salvandoMesa, setSalvandoMesa] = useState(false);
  const [erroMesa, setErroMesa] = useState<string | null>(null);

  const saloesPorId = useMemo(() => new Map(saloes.map((s) => [s.id, s])), [saloes]);

  async function carregar() {
    if (!unidade) return;
    setCarregando(true);
    setErro(null);
    try {
      const [listaSaloes, listaMesas] = await Promise.all([listarSaloes(unidade.id), listarMesas(unidade.id)]);
      setSaloes(listaSaloes);
      setMesas(listaMesas);
      setFormMesa((f) => ({ ...f, salaoId: f.salaoId || listaSaloes[0]?.id || "" }));
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel carregar salões e mesas.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidade?.id]);

  async function salvarSalao(e: React.FormEvent) {
    e.preventDefault();
    if (!unidade || !novoSalao.trim()) return;
    setSalvandoSalao(true);
    try {
      await criarSalao(unidade.id, novoSalao.trim());
      setNovoSalao("");
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel criar o salão.");
    } finally {
      setSalvandoSalao(false);
    }
  }

  async function salvarMesa(e: React.FormEvent) {
    e.preventDefault();
    if (!unidade) return;
    setSalvandoMesa(true);
    setErroMesa(null);
    try {
      await criarMesa(unidade.id, {
        salaoId: formMesa.salaoId,
        nome: formMesa.nome,
        capacidadeMin: Number(formMesa.capacidadeMin),
        capacidadeMax: Number(formMesa.capacidadeMax),
        formato: formMesa.formato,
      });
      setFormMesa((f) => ({ ...f, nome: "" }));
      await carregar();
    } catch (err) {
      setErroMesa(err instanceof ApiError ? err.message : "Nao foi possivel criar a mesa.");
    } finally {
      setSalvandoMesa(false);
    }
  }

  async function apagarMesa(mesa: Mesa) {
    if (!unidade) return;
    if (!confirm(`Remover a mesa "${mesa.nome}"?`)) return;
    try {
      await excluirMesa(unidade.id, mesa.id);
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel remover a mesa.");
    }
  }

  if (!unidade) return <p>Carregando unidade...</p>;

  return (
    <div>
      {erro && <p className="erro">{erro}</p>}

      <div className="cartao">
        <h3 style={{ marginTop: 0 }}>Salões</h3>
        <form className="linha-form" onSubmit={salvarSalao}>
          <label>
            Nome do salão
            <input value={novoSalao} onChange={(e) => setNovoSalao(e.target.value)} placeholder="Ex: Salão principal" required />
          </label>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="btn" type="submit" disabled={salvandoSalao}>
              Adicionar salão
            </button>
          </div>
        </form>
        {saloes.length > 0 && (
          <ul>
            {saloes.map((s) => (
              <li key={s.id}>{s.nome}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="cartao">
        <h3 style={{ marginTop: 0 }}>Nova mesa</h3>
        <form onSubmit={salvarMesa}>
          <div className="linha-form">
            <label>
              Salão
              <select value={formMesa.salaoId} onChange={(e) => setFormMesa({ ...formMesa, salaoId: e.target.value })} required>
                <option value="" disabled>
                  Selecione
                </option>
                {saloes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nome/numero da mesa
              <input value={formMesa.nome} onChange={(e) => setFormMesa({ ...formMesa, nome: e.target.value })} required />
            </label>
            <label>
              Formato
              <select value={formMesa.formato} onChange={(e) => setFormMesa({ ...formMesa, formato: e.target.value as MesaFormato })}>
                {FORMATOS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="linha-form">
            <label>
              Capacidade minima
              <input
                type="number"
                min={1}
                value={formMesa.capacidadeMin}
                onChange={(e) => setFormMesa({ ...formMesa, capacidadeMin: e.target.value })}
                required
              />
            </label>
            <label>
              Capacidade maxima
              <input
                type="number"
                min={1}
                value={formMesa.capacidadeMax}
                onChange={(e) => setFormMesa({ ...formMesa, capacidadeMax: e.target.value })}
                required
              />
            </label>
          </div>
          {erroMesa && <p className="erro">{erroMesa}</p>}
          <button className="btn" type="submit" disabled={salvandoMesa || saloes.length === 0}>
            {salvandoMesa ? "Salvando..." : "Adicionar mesa"}
          </button>
          {saloes.length === 0 && <p className="texto-secundario" style={{ fontSize: "0.85rem" }}>Cadastre um salão antes de adicionar mesas.</p>}
        </form>
      </div>

      <div className="cartao">
        <h3 style={{ marginTop: 0 }}>Mesas cadastradas</h3>
        {carregando ? (
          <p>Carregando...</p>
        ) : mesas.length === 0 ? (
          <p>Nenhuma mesa cadastrada.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Mesa</th>
                <th>Salão</th>
                <th>Capacidade</th>
                <th>Formato</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {mesas.map((m) => (
                <tr key={m.id}>
                  <td>{m.nome}</td>
                  <td>{saloesPorId.get(m.salaoId)?.nome ?? "-"}</td>
                  <td>
                    {m.capacidadeMin}-{m.capacidadeMax}
                  </td>
                  <td>{m.formato}</td>
                  <td>
                    <button className="btn btn-perigo" onClick={() => apagarMesa(m)}>
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
