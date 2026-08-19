import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.js";
import { ApiError } from "../api/client.js";
import {
  atualizarSalao,
  criarSalao,
  excluirSalao,
  listarBloqueios,
  listarElementosSalao,
  listarMesas,
  listarReservas,
  listarSaloes,
} from "../api/resources.js";
import type { Bloqueio, Mesa, ModoConfiguracaoSalao, ModoHorarioReservaSalao, Reserva, Salao, SalaoElemento } from "../types.js";
import { SalaoCanvasEditor } from "../components/salao-canvas/SalaoCanvasEditor.js";
import { Button, Modal, Skeleton } from "../components/ui/index.js";
import { useEhMobile } from "../lib/useEhMobile.js";

function hojeLocal(): string {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

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
  // Doc 30 - salao de campanha: quando preenchido, o salao so existe pra reserva
  // nessa data (ex: "Dia dos Namorados"). Vazio = salao permanente.
  dataEspecifica: string;
}

const FORM_SALAO_VAZIO: FormSalaoState = {
  nome: "",
  modoConfiguracao: "simples",
  capacidadeTotal: "",
  modoHorarioReserva: "turno",
  horariosFixos: "",
  intervaloInicio: "",
  intervaloFim: "",
  dataEspecifica: "",
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
    dataEspecifica: s.dataEspecifica ?? "",
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
    dataEspecifica: form.dataEspecifica || null,
  };
}

export function TablesPage() {
  const { unidade } = useAuth();
  const [saloes, setSaloes] = useState<Salao[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [elementosSalao, setElementosSalao] = useState<SalaoElemento[]>([]);
  // Doc redesign (achado #3/UX "diferencie livre, reservada, ocupada, bloqueada") -
  // reaproveita os MESMOS endpoints ja usados em ReservationsPage/BlocksPage, so
  // pra "hoje" - o editor visual e sobre a estrutura do salao, nao um agendador, entao
  // nao faz sentido buscar por um periodo maior aqui.
  const [reservasHoje, setReservasHoje] = useState<Reserva[]>([]);
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const ehMobile = useEhMobile();
  // Doc redesign, achado #3 - no mobile comeca como lista (leitura rapida), o canvas
  // completo (arrastar mesas) fica atras de um toggle explicito.
  const [verCanvasNoMobile, setVerCanvasNoMobile] = useState(false);

  const [novoSalao, setNovoSalao] = useState<FormSalaoState>(FORM_SALAO_VAZIO);
  const [salvandoSalao, setSalvandoSalao] = useState(false);

  const [editandoSalaoId, setEditandoSalaoId] = useState<string | null>(null);
  const [edicaoSalao, setEdicaoSalao] = useState<FormSalaoState>(FORM_SALAO_VAZIO);
  const [salvandoEdicaoSalao, setSalvandoEdicaoSalao] = useState(false);

  const [salaoVisualId, setSalaoVisualId] = useState<string>("");

  const saloesMapa = useMemo(() => saloes.filter((s) => s.modoConfiguracao === "mapa"), [saloes]);

  // Estado operacional de cada mesa AGORA (doc redesign, UX pedido: "diferencie
  // claramente livre, reservada, ocupada, bloqueada") - derivado so de dados que ja
  // existem (reservas de hoje + bloqueios ativos), nenhum campo novo no backend.
  // Prioridade quando mais de um se aplica: bloqueada (acao deliberada do dono) >
  // ocupada (cliente sentado, status "concluida" - ver ReservationsPage) > reservada
  // (pendente/confirmada) > livre (sem rotulo, aparencia padrao do canvas).
  const estadosOperacionaisMesas = useMemo(() => {
    const hoje = hojeLocal();
    const mapa = new Map<string, { estado: "reservada" | "ocupada" | "bloqueada"; rotulo: string }>();
    for (const b of bloqueios) {
      if (hoje < b.dataInicio || hoje > b.dataFim) continue;
      if (b.mesaId) mapa.set(b.mesaId, { estado: "bloqueada", rotulo: `Bloqueada: ${b.motivo}` });
    }
    for (const r of reservasHoje) {
      if (!r.mesaId || mapa.get(r.mesaId)?.estado === "bloqueada") continue;
      if (r.status === "concluida") {
        mapa.set(r.mesaId, { estado: "ocupada", rotulo: `Ocupada - ${r.clienteNome}` });
      } else if ((r.status === "pendente" || r.status === "confirmada") && !mapa.has(r.mesaId)) {
        mapa.set(r.mesaId, { estado: "reservada", rotulo: `Reservada ${r.horaInicio.slice(0, 5)} - ${r.clienteNome}` });
      }
    }
    return mapa;
  }, [reservasHoje, bloqueios]);

  async function carregar() {
    if (!unidade) return;
    setCarregando(true);
    setErro(null);
    try {
      const [listaSaloes, listaMesas, listaElementos, listaReservasHoje, listaBloqueios] = await Promise.all([
        listarSaloes(unidade.id),
        listarMesas(unidade.id),
        listarElementosSalao(unidade.id),
        listarReservas(unidade.id, hojeLocal()),
        listarBloqueios(unidade.id),
      ]);
      setSaloes(listaSaloes);
      setMesas(listaMesas);
      setElementosSalao(listaElementos);
      setReservasHoje(listaReservasHoje);
      setBloqueios(listaBloqueios);
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
        <form onSubmit={salvarSalao}>
          <div className="linha-form">
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
          </div>
          <p className="titulo-secao-form">Horário de reserva</p>
          <div className="linha-form">
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
          </div>
          <p className="titulo-secao-form">Campanha (opcional)</p>
          <div className="linha-form">
            <label style={{ maxWidth: 260 }}>
              Salão de campanha - data específica
              <input
                type="date"
                value={novoSalao.dataEspecifica}
                onChange={(e) => setNovoSalao({ ...novoSalao, dataEspecifica: e.target.value })}
              />
              <span className="texto-secundario" style={{ fontSize: "0.8rem" }}>
                Preencha só se este salão existir apenas para um dia (ex: Dia dos Namorados) - fora dessa data ele não
                aparece como opção.
              </span>
            </label>
          </div>
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
                <th>Data específica</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {saloes.map((s) => (
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
                  <td>{s.dataEspecifica ? s.dataEspecifica.split("-").reverse().join("/") : "-"}</td>
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
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Doc redesign, achado #2 da auditoria: editar salao saia dentro de uma celula
          de tabela ja com scroll horizontal - em mobile/tablet exigia scroll pra
          alcancar os campos/botoes. Modal resolve isso sem mudar nenhum dado/endpoint. */}
      <Modal
        titulo="Editar salão"
        aberto={editandoSalaoId !== null}
        aoFechar={() => setEditandoSalaoId(null)}
        rodape={
          <>
            <Button variante="secundario" onClick={() => setEditandoSalaoId(null)}>
              Cancelar
            </Button>
            <Button type="submit" form="form-editar-salao" disabled={salvandoEdicaoSalao}>
              {salvandoEdicaoSalao ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      >
        <form id="form-editar-salao" onSubmit={salvarEdicaoSalao}>
          <div className="linha-form">
            <label>
              Nome
              <input value={edicaoSalao.nome} onChange={(e) => setEdicaoSalao({ ...edicaoSalao, nome: e.target.value })} required />
            </label>
            <label>
              Modo
              <select
                value={edicaoSalao.modoConfiguracao}
                onChange={(e) => setEdicaoSalao({ ...edicaoSalao, modoConfiguracao: e.target.value as ModoConfiguracaoSalao })}
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
          </div>
          <p className="titulo-secao-form">Horário de reserva</p>
          <div className="linha-form">
            <label>
              Horário de reserva
              <select
                value={edicaoSalao.modoHorarioReserva}
                onChange={(e) => setEdicaoSalao({ ...edicaoSalao, modoHorarioReserva: e.target.value as ModoHorarioReservaSalao })}
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
          </div>
          <p className="titulo-secao-form">Campanha (opcional)</p>
          <label style={{ maxWidth: 260, marginBottom: 0 }}>
            Salão de campanha - data específica
            <input
              type="date"
              value={edicaoSalao.dataEspecifica}
              onChange={(e) => setEdicaoSalao({ ...edicaoSalao, dataEspecifica: e.target.value })}
            />
            <span className="texto-secundario" style={{ fontSize: "0.8rem" }}>
              Preencha só se este salão existir apenas para um dia - fora dessa data ele não aparece como opção.
            </span>
          </label>
        </form>
      </Modal>

      <div className="cartao">
        <h3 style={{ marginTop: 0 }}>Editor visual de mesas</h3>
        {saloesMapa.length === 0 ? (
          <p className="texto-secundario" style={{ fontSize: "0.85rem" }}>
            Cadastre um salão em modo "mapa" acima pra usar o editor visual de mesas.
          </p>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
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
              {/* Doc redesign, achado #3 da auditoria: o canvas de arrastar fica com
                  pouca altura util em telas estreitas - no mobile a visao padrao vira
                  uma lista de leitura rapida, com a opcao de abrir o editor visual
                  completo pra quem realmente precisa reposicionar mesas no celular.
                  Nada foi removido - so a visao padrao muda. */}
              {ehMobile && (
                <Button variante="secundario" onClick={() => setVerCanvasNoMobile((v) => !v)} style={{ marginBottom: "0.75rem" }}>
                  {verCanvasNoMobile ? "Ver como lista" : "Abrir editor visual"}
                </Button>
              )}
            </div>

            {(!ehMobile || verCanvasNoMobile) && (
              <div className="legenda-estado-mesa">
                <span>
                  <span className="legenda-estado-mesa-cor estado-reservada" /> Reservada
                </span>
                <span>
                  <span className="legenda-estado-mesa-cor estado-ocupada" /> Sentada
                </span>
                <span>
                  <span className="legenda-estado-mesa-cor estado-bloqueada" /> Bloqueada
                </span>
                <span className="texto-secundario">Sem marcação = livre agora</span>
              </div>
            )}

            {salaoVisualId ? (
              ehMobile && !verCanvasNoMobile ? (
                <div className="lista-mesas-mobile">
                  {mesas
                    .filter((m) => m.salaoId === salaoVisualId)
                    .map((m) => {
                      const info = estadosOperacionaisMesas.get(m.id);
                      return (
                        <div key={m.id} className="cartao lista-mesas-mobile-item">
                          <div>
                            <strong>{m.nome}</strong>
                            <div className="texto-secundario" style={{ fontSize: "0.82rem" }}>
                              {m.capacidadeMin}-{m.capacidadeMax} pessoas · {m.formato}
                            </div>
                          </div>
                          {info ? (
                            <span className={`badge badge-${info.estado === "bloqueada" ? "bloqueio" : info.estado === "ocupada" ? "concluida" : "pendente"}`}>
                              {info.estado === "bloqueada" ? "Bloqueada" : info.estado === "ocupada" ? "Sentada" : "Reservada"}
                            </span>
                          ) : (
                            <span className="texto-secundario" style={{ fontSize: "0.8rem" }}>
                              Livre
                            </span>
                          )}
                        </div>
                      );
                    })}
                </div>
              ) : (
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
                  estadosOperacionais={estadosOperacionaisMesas}
                />
              )
            ) : (
              // Doc redesign, docs/final-design-review.md "problemas restantes" #1 -
              // ultimo "Carregando..." solto do redesign, trocado por Skeleton no
              // formato aproximado do canvas (evita o salto de layout quando o
              // primeiro salao carrega e o editor aparece no lugar).
              carregando && <Skeleton altura="480px" />
            )}
          </>
        )}
      </div>
    </div>
  );
}
