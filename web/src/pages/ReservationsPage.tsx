import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.js";
import { ApiError } from "../api/client.js";
import {
  cancelarReserva,
  criarReserva,
  listarMesas,
  listarReservas,
  listarSaloes,
  atualizarReserva,
  type DadosNovaReserva,
} from "../api/resources.js";
import { CalendarioMes } from "../components/CalendarioMes.js";
import type { Mesa, Reserva, Salao } from "../types.js";

function dataLocal(offsetDias = 0): string {
  const agora = new Date();
  agora.setDate(agora.getDate() + offsetDias);
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function hojeLocal(): string {
  return dataLocal(0);
}

function dataFormatada(data: string): string {
  return data.split("-").reverse().join("/");
}

const STATUS_LABEL: Record<Reserva["status"], string> = {
  pendente: "Pendente",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
  concluida: "Concluida",
  no_show: "Nao compareceu",
};

type FiltroStatus = "todas" | Reserva["status"];

const ABAS_STATUS: FiltroStatus[] = ["todas", "confirmada", "pendente", "cancelada", "concluida", "no_show"];
const ABA_LABEL: Record<FiltroStatus, string> = { todas: "Todas", ...STATUS_LABEL };

// So reservas ainda ativas podem virar "sentada" ou "nao compareceu" (o backend
// tambem valida isso - aqui e so pra nao nem mostrar o botao quando nao se aplica).
const STATUS_ATIVOS = new Set<Reserva["status"]>(["pendente", "confirmada"]);

// "local" identifica onde a reserva vai (mesa especifica, modo mapa, ou o salao
// inteiro, modo simples): "mesa:<id>" ou "salao:<id>" - um unico seletor cobre os
// dois casos sem duplicar UI, ja que uma unidade pode ter saloes nos dois modos.
interface FormState {
  local: string;
  horaInicio: string;
  numPessoas: string;
  clienteNome: string;
  clienteTelefone: string;
  observacoes: string;
}

const FORM_VAZIO: FormState = {
  local: "",
  horaInicio: "",
  numPessoas: "2",
  clienteNome: "",
  clienteTelefone: "",
  observacoes: "",
};

function paraLocalDaReserva(reserva: Reserva): string {
  if (reserva.mesaId) return `mesa:${reserva.mesaId}`;
  if (reserva.salaoId) return `salao:${reserva.salaoId}`;
  return "";
}

export function ReservationsPage() {
  const { unidade } = useAuth();
  const [data, setData] = useState(hojeLocal());
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("todas");
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [saloes, setSaloes] = useState<Salao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<Reserva | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [calendarioAberto, setCalendarioAberto] = useState(false);

  const mesasPorId = useMemo(() => new Map(mesas.map((m) => [m.id, m])), [mesas]);
  const saloesPorId = useMemo(() => new Map(saloes.map((s) => [s.id, s])), [saloes]);
  const reservasFiltradas = useMemo(
    () => (filtroStatus === "todas" ? reservas : reservas.filter((r) => r.status === filtroStatus)),
    [reservas, filtroStatus],
  );
  // Opcoes do seletor "Local": mesas dos saloes em modo mapa + saloes inteiros em
  // modo simples - mesmo componente reaproveitado independente do mix de modos.
  const opcoesLocal = useMemo(() => {
    const opcoesMesas = mesas
      .filter((m) => saloesPorId.get(m.salaoId)?.modoConfiguracao === "mapa")
      .map((m) => ({
        value: `mesa:${m.id}`,
        label: `${m.nome} (${m.capacidadeMin}-${m.capacidadeMax} pessoas)`,
      }));
    const opcoesSaloes = saloes
      .filter((s) => s.modoConfiguracao === "simples")
      .map((s) => ({
        value: `salao:${s.id}`,
        label: `${s.nome} (salão - capacidade total ${s.capacidadeTotal ?? "nao configurada"})`,
      }));
    return [...opcoesMesas, ...opcoesSaloes];
  }, [mesas, saloes, saloesPorId]);

  function nomeDoLocal(reserva: Reserva): string {
    if (reserva.mesaId) return mesasPorId.get(reserva.mesaId)?.nome ?? "-";
    if (reserva.salaoId) return saloesPorId.get(reserva.salaoId)?.nome ?? "-";
    return "-";
  }

  async function carregar() {
    if (!unidade) return;
    setCarregando(true);
    setErro(null);
    try {
      const [listaReservas, listaMesas, listaSaloes] = await Promise.all([
        listarReservas(unidade.id, data),
        listarMesas(unidade.id),
        listarSaloes(unidade.id),
      ]);
      setReservas(listaReservas);
      setMesas(listaMesas);
      setSaloes(listaSaloes);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel carregar as reservas.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidade?.id, data]);

  function abrirNovaReserva() {
    setEditando(null);
    setForm({ ...FORM_VAZIO, horaInicio: "" });
    setErroForm(null);
    setFormAberto(true);
  }

  function abrirEdicao(reserva: Reserva) {
    setEditando(reserva);
    setForm({
      local: paraLocalDaReserva(reserva),
      horaInicio: reserva.horaInicio.slice(0, 5),
      numPessoas: String(reserva.numPessoas),
      clienteNome: reserva.clienteNome,
      clienteTelefone: reserva.clienteTelefone ?? "",
      observacoes: reserva.observacoes ?? "",
    });
    setErroForm(null);
    setFormAberto(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!unidade) return;
    setSalvando(true);
    setErroForm(null);
    try {
      const [tipo, alvoId] = form.local.split(":");
      const mesaId = tipo === "mesa" ? alvoId : undefined;
      const salaoId = tipo === "salao" ? alvoId : undefined;
      if (editando) {
        await atualizarReserva(unidade.id, editando.id, {
          mesaId,
          salaoId,
          horaInicio: form.horaInicio,
          numPessoas: Number(form.numPessoas),
          clienteNome: form.clienteNome,
          clienteTelefone: form.clienteTelefone || undefined,
          observacoes: form.observacoes || undefined,
        });
      } else {
        const dados: DadosNovaReserva = {
          mesaId,
          salaoId,
          data,
          horaInicio: form.horaInicio,
          numPessoas: Number(form.numPessoas),
          clienteNome: form.clienteNome,
          clienteTelefone: form.clienteTelefone || undefined,
          observacoes: form.observacoes || undefined,
        };
        await criarReserva(unidade.id, dados);
      }
      setFormAberto(false);
      await carregar();
    } catch (err) {
      setErroForm(err instanceof ApiError ? err.message : "Nao foi possivel salvar a reserva.");
    } finally {
      setSalvando(false);
    }
  }

  async function cancelar(reserva: Reserva) {
    if (!unidade) return;
    if (!confirm(`Cancelar a reserva de ${reserva.clienteNome}?`)) return;
    try {
      await cancelarReserva(unidade.id, reserva.id);
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel cancelar a reserva.");
    }
  }

  async function marcarStatus(reserva: Reserva, status: "concluida" | "no_show") {
    if (!unidade) return;
    try {
      await atualizarReserva(unidade.id, reserva.id, { status });
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel atualizar o status da reserva.");
    }
  }

  if (!unidade) {
    return <p>Carregando unidade...</p>;
  }

  return (
    <div>
      <div className="cartao">
        <div className="seletor-data">
          <div className="pilulas-data">
            <button
              type="button"
              className={`pilula-data ${data === dataLocal(-1) ? "ativa" : ""}`}
              onClick={() => setData(dataLocal(-1))}
            >
              Ontem
            </button>
            <button
              type="button"
              className={`pilula-data ${data === hojeLocal() ? "ativa" : ""}`}
              onClick={() => setData(hojeLocal())}
            >
              Hoje
            </button>
            <button
              type="button"
              className={`pilula-data ${data === dataLocal(1) ? "ativa" : ""}`}
              onClick={() => setData(dataLocal(1))}
            >
              Amanha
            </button>
          </div>
          <div className="seletor-data-calendario">
            <button
              type="button"
              className="btn btn-secundario"
              onClick={() => setCalendarioAberto((a) => !a)}
              aria-expanded={calendarioAberto}
            >
              {dataFormatada(data)} 📅
            </button>
            {calendarioAberto && (
              <div className="calendario-mes-flutuante">
                <CalendarioMes
                  unidadeId={unidade.id}
                  dataSelecionada={data}
                  onSelecionarData={(novaData) => {
                    setData(novaData);
                    setCalendarioAberto(false);
                  }}
                />
              </div>
            )}
          </div>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={abrirNovaReserva}>
            + Nova reserva
          </button>
        </div>
      </div>

      {erro && (
        <p className="erro" style={{ marginBottom: "1rem" }}>
          {erro}
        </p>
      )}

      {formAberto && (
        <form className="cartao" onSubmit={salvar}>
          <h3 style={{ marginTop: 0 }}>{editando ? "Editar reserva" : "Nova reserva"}</h3>
          <div className="linha-form">
            <label>
              Local
              <select value={form.local} onChange={(e) => setForm({ ...form, local: e.target.value })} required>
                <option value="" disabled>
                  Selecione
                </option>
                {opcoesLocal.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Horario
              <input
                type="time"
                value={form.horaInicio}
                onChange={(e) => setForm({ ...form, horaInicio: e.target.value })}
                required
              />
            </label>
            <label>
              Numero de pessoas
              <input
                type="number"
                min={1}
                value={form.numPessoas}
                onChange={(e) => setForm({ ...form, numPessoas: e.target.value })}
                required
              />
            </label>
          </div>
          <div className="linha-form">
            <label>
              Nome do cliente
              <input value={form.clienteNome} onChange={(e) => setForm({ ...form, clienteNome: e.target.value })} required />
            </label>
            <label>
              Telefone
              <input value={form.clienteTelefone} onChange={(e) => setForm({ ...form, clienteTelefone: e.target.value })} />
            </label>
          </div>
          <label style={{ marginBottom: "0.75rem" }}>
            Observacoes
            <textarea rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </label>
          {erroForm && <p className="erro">{erroForm}</p>}
          <div className="acoes">
            <button className="btn" type="submit" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
            <button className="btn btn-secundario" type="button" onClick={() => setFormAberto(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="cartao">
        <div className="abas-status">
          {ABAS_STATUS.map((status) => (
            <button
              key={status}
              type="button"
              className={`aba-status ${filtroStatus === status ? "ativa" : ""}`}
              onClick={() => setFiltroStatus(status)}
            >
              {ABA_LABEL[status]}
              {status !== "todas" && (
                <span className="texto-secundario"> ({reservas.filter((r) => r.status === status).length})</span>
              )}
            </button>
          ))}
        </div>
        {carregando ? (
          <p>Carregando...</p>
        ) : reservas.length === 0 ? (
          <p className="texto-secundario">Nenhuma reserva para esta data.</p>
        ) : reservasFiltradas.length === 0 ? (
          <p className="texto-secundario">Nenhuma reserva com esse status.</p>
        ) : (
          <>
          <div className="reservas-mobile">
            {reservasFiltradas.map((reserva) => (
              <div key={reserva.id} className="reserva-card-mobile">
                <div className="reserva-card-mobile-topo">
                  <span className="reserva-card-mobile-hora">{reserva.horaInicio.slice(0, 5)}</span>
                  <span className={`badge badge-${reserva.status}`}>{STATUS_LABEL[reserva.status]}</span>
                </div>
                <strong className="reserva-card-mobile-nome">{reserva.clienteNome}</strong>
                <div className="texto-secundario reserva-card-mobile-detalhes">
                  {reserva.numPessoas} pessoa(s) - {nomeDoLocal(reserva)}
                  {reserva.clienteTelefone && <> - {reserva.clienteTelefone}</>}
                </div>
                {STATUS_ATIVOS.has(reserva.status) && (
                  <div className="reserva-card-mobile-acoes">
                    <button className="btn" onClick={() => marcarStatus(reserva, "concluida")}>
                      Marcar como sentada
                    </button>
                    <button className="btn btn-secundario" onClick={() => marcarStatus(reserva, "no_show")}>
                      Nao compareceu
                    </button>
                  </div>
                )}
                {reserva.status !== "cancelada" && (
                  <div className="reserva-card-mobile-acoes reserva-card-mobile-acoes-secundarias">
                    <button className="btn btn-secundario" onClick={() => abrirEdicao(reserva)}>
                      Editar
                    </button>
                    <button className="btn btn-perigo" onClick={() => cancelar(reserva)}>
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <table className="tabela-reservas">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Cliente</th>
                <th>Pessoas</th>
                <th>Local</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reservasFiltradas.map((reserva) => (
                <tr key={reserva.id}>
                  <td>{reserva.horaInicio.slice(0, 5)}</td>
                  <td>
                    {reserva.clienteNome}
                    {reserva.clienteTelefone && <div className="texto-secundario" style={{ fontSize: "0.8rem" }}>{reserva.clienteTelefone}</div>}
                  </td>
                  <td>{reserva.numPessoas}</td>
                  <td>{nomeDoLocal(reserva)}</td>
                  <td>
                    <span className={`badge badge-${reserva.status}`}>{STATUS_LABEL[reserva.status]}</span>
                  </td>
                  <td>
                    <div className="acoes">
                      {STATUS_ATIVOS.has(reserva.status) && (
                        <>
                          <button className="btn btn-secundario" onClick={() => marcarStatus(reserva, "concluida")}>
                            Marcar como sentada
                          </button>
                          <button className="btn btn-secundario" onClick={() => marcarStatus(reserva, "no_show")}>
                            Nao compareceu
                          </button>
                        </>
                      )}
                      {reserva.status !== "cancelada" && (
                        <>
                          <button className="btn btn-secundario" onClick={() => abrirEdicao(reserva)}>
                            Editar
                          </button>
                          <button className="btn btn-perigo" onClick={() => cancelar(reserva)}>
                            Cancelar
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}
      </div>
    </div>
  );
}
