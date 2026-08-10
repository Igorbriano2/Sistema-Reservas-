import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.js";
import { ApiError } from "../api/client.js";
import { atualizarSalao, criarSalao, excluirSalao, listarElementosSalao, listarMesas, listarSaloes } from "../api/resources.js";
import type { Mesa, ModoConfiguracaoSalao, ModoHorarioReservaSalao, Salao, SalaoElemento } from "../types.js";
import { SalaoCanvasEditor } from "../components/salao-canvas/SalaoCanvasEditor.js";

const MODO_LABEL: Record<ModoConfiguracaoSalao, string> = {
  simples: "Simples (so capacidade total)",
  mapa: "Mapa (mesas individuais)",
};

// Doc 29 - horario de reserva proprio do salao (alem do turno da unidade, sempre
// valido). So restringe a reserva PUBLICA - reserva manual pelo painel nunca e afetada.
const MODO_HORARIO_LABEL: Record<ModoHorarioReservaSalao, string> = {
  turno: "Segue o turno da unidade (padrão)",
  fixo: "Reserva fixa (horários específicos)",
  intervalo: "Reserva por intervalo",
};

interface FormSalaoState {
  nome: string;
  modoConfiguracao: ModoConfiguracaoSalao;
  capacidadeTotal: string;
  modoHorarioReserva: ModoHorarioReservaSalao;
  horariosFixos: string;
  intervaloInicio: string;
  intervaloFim: string;
}

const FORM_SALAO_VAZIO: FormSalaoState = {
  nome: "",
  modoConfiguracao: "simples",
  capacidadeTotal: "",
  modoHorarioReserva: "turno",
  horariosFixos: "",
  intervaloInicio: "",
  intervaloFim: "",
};

function salaoParaForm(s: Salao): FormSalaoState {
  return {
    nome: s.nome,
    modoConfiguracao: s.modoConfiguracao,
    capacidadeTotal: s.capacidadeTotal != null ? String(s.capacidadeTotal) : "",
    modoHorarioReserva: s.modoHorarioReserva,
    horariosFixos: s.horariosFixos && s.horariosFixos.length > 0 ? s.horariosFixos.map((h) => h.slice(0, 5)).join(", ") : "",
    intervaloInicio: s.intervaloInicio?.slice(0, 5) ?? "",
    intervaloFim: s.intervaloFim?.slice(0, 5) ?? "",
  };
}

function formSalaoParaDados(form: FormSalaoState) {
  return {
    nome: form.nome.trim(),
    modoConfiguracao: form.modoConfiguracao,
    capacidadeTotal: form.capacidadeTotal ? Number(form.capacidadeTotal) : undefined,
    modoHorarioReserva: form.modoHorarioReserva,
    horariosFixos:
      form.modoHorarioReserva === "fixo"
        ? form.horariosFixos
            .split(",")
            .map((h) => h.trim())
            .filter(Boolean)
        : null,
    intervaloInicio: form.modoHorarioReserva === "intervalo" ? form.intervaloInicio || null : null,
    intervaloFim: form.modoHorarioReserva === "intervalo" ? form.intervaloFim || null : null,
  };
}

export function TablesPage() {
  const { unidade } = useAuth();
  const [saloes, setSaloes] = useState<Salao[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [elementosSalao, setElementosSalao] = useState<SalaoElemento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [novoSalao, setNovoSalao] = useState<FormSalaoState>(FORM_SALAO_VAZIO);
  const [salvandoSalao, setSalvandoSalao] = useState(false);

  const [editandoSalaoId, setEditandoSalaoId] = useState<string | null>(null);
  const [edicaoSalao, setEdicaoSalao] = useState<FormSalaoState>(FORM_SALAO_VAZIO);
  const [salvandoEdicaoSalao, setSalvandoEdicaoSalao] = useState(false);

  const [salaoVisualId, setSalaoVisualId] = useState<string>("");

  const saloesMapa = useMemo(() => saloes.filter((s) => s.modoConfiguracao === "mapa"), [saloes]);

  async function carregar() {
    if (!unidade) return;
    setCarregando(true);
    setErro(null);
    try {
      const [listaSaloes, listaMesas, listaElementos] = await Promise.all([
        listarSaloes(unidade.id),
        listarMesas(unidade.id),
        listarElementosSalao(unidade.id),
      ]);
      setSaloes(listaSaloes);
      setMesas(listaMesas);
      setElementosSalao(listaElementos);
      const saloesMapaCarregados = listaSaloes.filter((s) => s.modoConfiguracao === "mapa");
      setSalaoVisualId((atual) => (saloesMapaCarregados.some((s) => s.id === atual) ? atual : saloesMapaCarregados[0]?.id ?? ""));
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
      await criarSalao(unidade.id, formSalaoParaDados(novoSalao));
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
    setEdicaoSalao(salaoParaForm(salao));
  }

  async function removerSalao(salao: Salao) {
    if (!unidade) return;
    if (!confirm(`Excluir o salão "${salao.nome}"? Isso também remove as mesas cadastradas nele.`)) return;
    setErro(null);
    try {
      await excluirSalao(unidade.id, salao.id);
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível excluir o salão.");
    }
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
      await atualizarSalao(unidade.id, editandoSalaoId, formSalaoParaDados(edicaoSalao));
      setEditandoSalaoId(null);
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel atualizar o salão.");
    } finally {
      setSalvandoEdicaoSalao(false);
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
          <label>
            Horário de reserva
            <select
              value={novoSalao.modoHorarioReserva}
              onChange={(e) => setNovoSalao({ ...novoSalao, modoHorarioReserva: e.target.value as ModoHorarioReservaSalao })}
            >
              {(Object.keys(MODO_HORARIO_LABEL) as ModoHorarioReservaSalao[]).map((m) => (
                <option key={m} value={m}>
                  {MODO_HORARIO_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
          {novoSalao.modoHorarioReserva === "fixo" && (
            <label>
              Horários fixos (separados por vírgula)
              <input
                value={novoSalao.horariosFixos}
                onChange={(e) => setNovoSalao({ ...novoSalao, horariosFixos: e.target.value })}
                placeholder="Ex: 19:00, 20:00, 21:00"
                required
              />
            </label>
          )}
          {novoSalao.modoHorarioReserva === "intervalo" && (
            <>
              <label>
                Das
                <input
                  type="time"
                  value={novoSalao.intervaloInicio}
                  onChange={(e) => setNovoSalao({ ...novoSalao, intervaloInicio: e.target.value })}
                  required
                />
              </label>
              <label>
                Até
                <input
                  type="time"
                  value={novoSalao.intervaloFim}
                  onChange={(e) => setNovoSalao({ ...novoSalao, intervaloFim: e.target.value })}
                  required
                />
              </label>
            </>
          )}
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="btn" type="submit" disabled={salvandoSalao}>
              Adicionar salão
            </button>
          </div>
        </form>
        {saloes.length > 0 && (
          <div className="tabela-scroll">
          <table>
            <thead>
              <tr>
                <th>Salão</th>
                <th>Modo</th>
                <th>Capacidade</th>
                <th>Horário de reserva</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {saloes.map((s) =>
                editandoSalaoId === s.id ? (
                  <tr key={s.id}>
                    <td colSpan={5}>
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
                        <label>
                          Horário de reserva
                          <select
                            value={edicaoSalao.modoHorarioReserva}
                            onChange={(e) =>
                              setEdicaoSalao({ ...edicaoSalao, modoHorarioReserva: e.target.value as ModoHorarioReservaSalao })
                            }
                          >
                            {(Object.keys(MODO_HORARIO_LABEL) as ModoHorarioReservaSalao[]).map((m) => (
                              <option key={m} value={m}>
                                {MODO_HORARIO_LABEL[m]}
                              </option>
                            ))}
                          </select>
                        </label>
                        {edicaoSalao.modoHorarioReserva === "fixo" && (
                          <label>
                            Horários fixos (separados por vírgula)
                            <input
                              value={edicaoSalao.horariosFixos}
                              onChange={(e) => setEdicaoSalao({ ...edicaoSalao, horariosFixos: e.target.value })}
                              placeholder="Ex: 19:00, 20:00, 21:00"
                              required
                            />
                          </label>
                        )}
                        {edicaoSalao.modoHorarioReserva === "intervalo" && (
                          <>
                            <label>
                              Das
                              <input
                                type="time"
                                value={edicaoSalao.intervaloInicio}
                                onChange={(e) => setEdicaoSalao({ ...edicaoSalao, intervaloInicio: e.target.value })}
                                required
                              />
                            </label>
                            <label>
                              Até
                              <input
                                type="time"
                                value={edicaoSalao.intervaloFim}
                                onChange={(e) => setEdicaoSalao({ ...edicaoSalao, intervaloFim: e.target.value })}
                                required
                              />
                            </label>
                          </>
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
                      {s.modoHorarioReserva === "fixo" && s.horariosFixos
                        ? s.horariosFixos.map((h) => h.slice(0, 5)).join(", ")
                        : s.modoHorarioReserva === "intervalo" && s.intervaloInicio && s.intervaloFim
                          ? `${s.intervaloInicio.slice(0, 5)} – ${s.intervaloFim.slice(0, 5)}`
                          : "Segue o turno"}
                    </td>
                    <td>
                      <div className="acoes">
                        <button className="btn btn-secundario" onClick={() => abrirEdicaoSalao(s)}>
                          Editar
                        </button>
                        <button className="btn btn-perigo" onClick={() => removerSalao(s)}>
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <div className="cartao">
        <h3 style={{ marginTop: 0 }}>Editor visual de mesas</h3>
        {saloesMapa.length === 0 ? (
          <p className="texto-secundario" style={{ fontSize: "0.85rem" }}>
            Cadastre um salão em modo "mapa" acima pra usar o editor visual de mesas.
          </p>
        ) : (
          <>
            <label style={{ display: "inline-block", marginBottom: "0.75rem" }}>
              Salão
              <select value={salaoVisualId} onChange={(e) => setSalaoVisualId(e.target.value)}>
                {saloesMapa.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </label>
            {salaoVisualId ? (
              // key={salaoVisualId}: remonta (estado local limpo) so ao trocar de salão -
              // recarregamentos em segundo plano (apos criar/duplicar/excluir um item, via
              // onAlterado) NAO devem desmontar o editor, ou perderiam qualquer edicao local
              // ainda pendente (nome/rotacao/posicao arrastada) que o dono nao salvou ainda.
              <SalaoCanvasEditor
                key={salaoVisualId}
                unidadeId={unidade.id}
                salaoId={salaoVisualId}
                mesasDoSalao={mesas.filter((m) => m.salaoId === salaoVisualId)}
                elementosDoSalao={elementosSalao.filter((e) => e.salaoId === salaoVisualId)}
                onAlterado={carregar}
              />
            ) : (
              carregando && <p>Carregando...</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
