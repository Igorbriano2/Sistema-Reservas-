import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.js";
import { ApiError } from "../api/client.js";
import {
  cancelarReserva,
  criarReserva,
  listarMesas,
  listarReservas,
  atualizarReserva,
  type DadosNovaReserva,
} from "../api/resources.js";
import type { Mesa, Reserva } from "../types.js";

function hojeLocal(): string {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
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

interface FormState {
  mesaId: string;
  horaInicio: string;
  numPessoas: string;
  clienteNome: string;
  clienteTelefone: string;
  observacoes: string;
}

const FORM_VAZIO: FormState = {
  mesaId: "",
  horaInicio: "",
  numPessoas: "2",
  clienteNome: "",
  clienteTelefone: "",
  observacoes: "",
};

export function ReservationsPage() {
  const { unidade } = useAuth();
  const [data, setData] = useState(hojeLocal());
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("todas");
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<Reserva | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  const mesasPorId = useMemo(() => new Map(mesas.map((m) => [m.id, m])), [mesas]);
  const reservasFiltradas = useMemo(
    () => (filtroStatus === "todas" ? reservas : reservas.filter((r) => r.status === filtroStatus)),
    [reservas, filtroStatus],
  );

  async function carregar() {
    if (!unidade) return;
    setCarregando(true);
    setErro(null);
    try {
      const [listaReservas, listaMesas] = await Promise.all([listarReservas(unidade.id, data), listarMesas(unidade.id)]);
      setReservas(listaReservas);
      setMesas(listaMesas);
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
      mesaId: reserva.mesaId,
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
      if (editando) {
        await atualizarReserva(unidade.id, editando.id, {
          mesaId: form.mesaId,
          horaInicio: form.horaInicio,
          numPessoas: Number(form.numPessoas),
          clienteNome: form.clienteNome,
          clienteTelefone: form.clienteTelefone || undefined,
          observacoes: form.observacoes || undefined,
        });
      } else {
        const dados: DadosNovaReserva = {
          mesaId: form.mesaId,
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

  if (!unidade) {
    return <p>Carregando unidade...</p>;
  }

  return (
    <div>
      <div className="cartao">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
          <label style={{ maxWidth: 220 }}>
            Data
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </label>
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
              Mesa
              <select value={form.mesaId} onChange={(e) => setForm({ ...form, mesaId: e.target.value })} required>
                <option value="" disabled>
                  Selecione
                </option>
                {mesas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome} ({m.capacidadeMin}-{m.capacidadeMax} pessoas)
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
          <table>
            <thead>
              <tr>
                <th>Hora</th>
                <th>Cliente</th>
                <th>Pessoas</th>
                <th>Mesa</th>
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
                  <td>{mesasPorId.get(reserva.mesaId)?.nome ?? "-"}</td>
                  <td>
                    <span className={`badge badge-${reserva.status}`}>{STATUS_LABEL[reserva.status]}</span>
                  </td>
                  <td>
                    <div className="acoes">
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
        )}
      </div>
    </div>
  );
}
