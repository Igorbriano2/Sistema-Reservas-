import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.js";
import { ApiError } from "../api/client.js";
import { atualizarSalao, criarMesa, criarSalao, excluirMesa, listarMesas, listarSaloes } from "../api/resources.js";
import type { Mesa, MesaFormato, ModoConfiguracaoSalao, Salao } from "../types.js";

const FORMATOS: MesaFormato[] = ["redonda", "quadrada", "retangular"];

const MODO_LABEL: Record<ModoConfiguracaoSalao, string> = {
  simples: "Simples (so capacidade total)",
  mapa: "Mapa (mesas individuais)",
};

interface FormSalaoState {
  nome: string;
  modoConfiguracao: ModoConfiguracaoSalao;
  capacidadeTotal: string;
}

const FORM_SALAO_VAZIO: FormSalaoState = { nome: "", modoConfiguracao: "simples", capacidadeTotal: "" };

export function TablesPage() {
  const { unidade } = useAuth();
  const [saloes, setSaloes] = useState<Salao[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [novoSalao, setNovoSalao] = useState<FormSalaoState>(FORM_SALAO_VAZIO);
  const [salvandoSalao, setSalvandoSalao] = useState(false);

  const [editandoSalaoId, setEditandoSalaoId] = useState<string | null>(null);
  const [edicaoSalao, setEdicaoSalao] = useState<FormSalaoState>(FORM_SALAO_VAZIO);
  const [salvandoEdicaoSalao, setSalvandoEdicaoSalao] = useState(false);

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
  const saloesMapa = useMemo(() => saloes.filter((s) => s.modoConfiguracao === "mapa"), [saloes]);

  async function carregar() {
    if (!unidade) return;
    setCarregando(true);
    setErro(null);
    try {
      const [listaSaloes, listaMesas] = await Promise.all([listarSaloes(unidade.id), listarMesas(unidade.id)]);
      setSaloes(listaSaloes);
      setMesas(listaMesas);
      const saloesMapaCarregados = listaSaloes.filter((s) => s.modoConfiguracao === "mapa");
      setFormMesa((f) => ({ ...f, salaoId: f.salaoId || saloesMapaCarregados[0]?.id || "" }));
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
    if (!unidade || !novoSalao.nome.trim()) return;
    if (novoSalao.modoConfiguracao === "simples" && !novoSalao.capacidadeTotal) {
      setErro("Informe a capacidade total do salão em modo simples.");
      return;
    }
    setSalvandoSalao(true);
    try {
      await criarSalao(unidade.id, {
        nome: novoSalao.nome.trim(),
        modoConfiguracao: novoSalao.modoConfiguracao,
        capacidadeTotal: novoSalao.capacidadeTotal ? Number(novoSalao.capacidadeTotal) : undefined,
      });
      setNovoSalao(FORM_SALAO_VAZIO);
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel criar o salão.");
    } finally {
      setSalvandoSalao(false);
    }
  }

  function abrirEdicaoSalao(salao: Salao) {
    setEditandoSalaoId(salao.id);
    setEdicaoSalao({
      nome: salao.nome,
      modoConfiguracao: salao.modoConfiguracao,
      capacidadeTotal: salao.capacidadeTotal != null ? String(salao.capacidadeTotal) : "",
    });
  }

  async function salvarEdicaoSalao(e: React.FormEvent) {
    e.preventDefault();
    if (!unidade || !editandoSalaoId) return;
    if (edicaoSalao.modoConfiguracao === "simples" && !edicaoSalao.capacidadeTotal) {
      setErro("Informe a capacidade total do salão em modo simples.");
      return;
    }
    setSalvandoEdicaoSalao(true);
    try {
      await atualizarSalao(unidade.id, editandoSalaoId, {
        nome: edicaoSalao.nome.trim(),
        modoConfiguracao: edicaoSalao.modoConfiguracao,
        capacidadeTotal: edicaoSalao.capacidadeTotal ? Number(edicaoSalao.capacidadeTotal) : undefined,
      });
      setEditandoSalaoId(null);
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel atualizar o salão.");
    } finally {
      setSalvandoEdicaoSalao(false);
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
        <p className="texto-secundario" style={{ fontSize: "0.85rem", marginTop: 0 }}>
          Modo <strong>simples</strong>: voce so informa a capacidade total simultanea do salão (sem cadastrar mesas).
          Modo <strong>mapa</strong>: cadastro individual de mesas com capacidade cada uma.
        </p>
        <form className="linha-form" onSubmit={salvarSalao}>
          <label>
            Nome do salão
            <input
              value={novoSalao.nome}
              onChange={(e) => setNovoSalao({ ...novoSalao, nome: e.target.value })}
              placeholder="Ex: Salão principal"
              required
            />
          </label>
          <label>
            Modo
            <select
              value={novoSalao.modoConfiguracao}
              onChange={(e) => setNovoSalao({ ...novoSalao, modoConfiguracao: e.target.value as ModoConfiguracaoSalao })}
            >
              {(Object.keys(MODO_LABEL) as ModoConfiguracaoSalao[]).map((m) => (
                <option key={m} value={m}>
                  {MODO_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
          {novoSalao.modoConfiguracao === "simples" && (
            <label>
              Capacidade total
              <input
                type="number"
                min={1}
                value={novoSalao.capacidadeTotal}
                onChange={(e) => setNovoSalao({ ...novoSalao, capacidadeTotal: e.target.value })}
                required
              />
            </label>
          )}
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="btn" type="submit" disabled={salvandoSalao}>
              Adicionar salão
            </button>
          </div>
        </form>
        {saloes.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Salão</th>
                <th>Modo</th>
                <th>Capacidade</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {saloes.map((s) =>
                editandoSalaoId === s.id ? (
                  <tr key={s.id}>
                    <td colSpan={4}>
                      <form className="linha-form" onSubmit={salvarEdicaoSalao} style={{ margin: 0 }}>
                        <label>
                          Nome
                          <input
                            value={edicaoSalao.nome}
                            onChange={(e) => setEdicaoSalao({ ...edicaoSalao, nome: e.target.value })}
                            required
                          />
                        </label>
                        <label>
                          Modo
                          <select
                            value={edicaoSalao.modoConfiguracao}
                            onChange={(e) =>
                              setEdicaoSalao({ ...edicaoSalao, modoConfiguracao: e.target.value as ModoConfiguracaoSalao })
                            }
                          >
                            {(Object.keys(MODO_LABEL) as ModoConfiguracaoSalao[]).map((m) => (
                              <option key={m} value={m}>
                                {MODO_LABEL[m]}
                              </option>
                            ))}
                          </select>
                        </label>
                        {edicaoSalao.modoConfiguracao === "simples" && (
                          <label>
                            Capacidade total
                            <input
                              type="number"
                              min={1}
                              value={edicaoSalao.capacidadeTotal}
                              onChange={(e) => setEdicaoSalao({ ...edicaoSalao, capacidadeTotal: e.target.value })}
                              required
                            />
                          </label>
                        )}
                        <div className="acoes">
                          <button className="btn" type="submit" disabled={salvandoEdicaoSalao}>
                            Salvar
                          </button>
                          <button className="btn btn-secundario" type="button" onClick={() => setEditandoSalaoId(null)}>
                            Cancelar
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={s.id}>
                    <td>{s.nome}</td>
                    <td>{MODO_LABEL[s.modoConfiguracao]}</td>
                    <td>{s.modoConfiguracao === "simples" ? s.capacidadeTotal ?? "nao configurada" : "-"}</td>
                    <td>
                      <button className="btn btn-secundario" onClick={() => abrirEdicaoSalao(s)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="cartao">
        <h3 style={{ marginTop: 0 }}>Nova mesa</h3>
        <p className="texto-secundario" style={{ fontSize: "0.85rem", marginTop: 0 }}>
          Mesas so se aplicam a salões em modo "mapa".
        </p>
        <form onSubmit={salvarMesa}>
          <div className="linha-form">
            <label>
              Salão
              <select value={formMesa.salaoId} onChange={(e) => setFormMesa({ ...formMesa, salaoId: e.target.value })} required>
                <option value="" disabled>
                  Selecione
                </option>
                {saloesMapa.map((s) => (
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
          <button className="btn" type="submit" disabled={salvandoMesa || saloesMapa.length === 0}>
            {salvandoMesa ? "Salvando..." : "Adicionar mesa"}
          </button>
          {saloesMapa.length === 0 && (
            <p className="texto-secundario" style={{ fontSize: "0.85rem" }}>
              Cadastre um salão em modo "mapa" antes de adicionar mesas.
            </p>
          )}
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
