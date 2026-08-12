import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import { IconeWhatsApp } from "../components/IconeWhatsApp.js";
import { linkWhatsApp } from "../lib/whatsapp.js";
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

// So reservas ainda ativas podem virar "sentada" ou "nao compareceu" (o backend
// tambem valida isso - aqui e so pra nao nem mostrar o botao quando nao se aplica).
const STATUS_ATIVOS = new Set<Reserva["status"]>(["pendente", "confirmada"]);

// Painel operacional (estilo GetIn): em vez de uma aba por status tecnico, agrupa no
// que importa pro atendente na portaria - quem ainda vai chegar, quem ja sentou, quem
// nao vai mais aparecer (cancelada ou nao compareceu). O badge de cada linha continua
// mostrando o status exato (ver STATUS_LABEL).
type GrupoStatus = "recebidas" | "sentadas" | "canceladas" | "todas";

const GRUPO_STATUSES: Record<Exclude<GrupoStatus, "todas">, Reserva["status"][]> = {
  recebidas: ["pendente", "confirmada"],
  sentadas: ["concluida"],
  canceladas: ["cancelada", "no_show"],
};

const GRUPOS: GrupoStatus[] = ["recebidas", "sentadas", "canceladas", "todas"];
const GRUPO_LABEL: Record<GrupoStatus, string> = {
  recebidas: "Recebidas",
  sentadas: "Sentadas",
  canceladas: "Canceladas",
  todas: "Todas",
};

function contarNoGrupo(reservas: Reserva[], grupo: GrupoStatus): number {
  if (grupo === "todas") return reservas.length;
  return reservas.filter((r) => GRUPO_STATUSES[grupo].includes(r.status)).length;
}

// Faixas de tamanho de grupo pro resumo de lugares do rodape (estilo GetIn) - da pro
// atendente ver de relance quantas reservas de cada porte estao chegando no dia.
const FAIXAS_TAMANHO: Array<{ label: string; min: number; max: number }> = [
  { label: "1-2", min: 1, max: 2 },
  { label: "3-4", min: 3, max: 4 },
  { label: "5-6", min: 5, max: 6 },
  { label: "7-8", min: 7, max: 8 },
  { label: "9-10", min: 9, max: 10 },
  { label: "11-12", min: 11, max: 12 },
  { label: "13+", min: 13, max: Infinity },
];

function horaAtualLocal(): string {
  const agora = new Date();
  return `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}:00`;
}

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
  const [grupo, setGrupo] = useState<GrupoStatus>("recebidas");
  const [busca, setBusca] = useState("");
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
  const reservasFiltradas = useMemo(() => {
    const buscaNormalizada = busca.trim().toLowerCase();
    return reservas
      .filter((r) => grupo === "todas" || GRUPO_STATUSES[grupo].includes(r.status))
      .filter(
        (r) =>
          !buscaNormalizada ||
          r.clienteNome.toLowerCase().includes(buscaNormalizada) ||
          (r.clienteTelefone ?? "").toLowerCase().includes(buscaNormalizada),
      );
  }, [reservas, grupo, busca]);
  // Reservas que ja passaram do horario e ninguem marcou como sentada/nao compareceu -
  // so faz sentido alertar quando o atendente esta olhando o dia de hoje.
  const reservasAtrasadas = useMemo(() => {
    if (data !== hojeLocal()) return [];
    const agora = horaAtualLocal();
    return reservas.filter((r) => STATUS_ATIVOS.has(r.status) && r.horaInicio < agora);
  }, [reservas, data]);
  const totalPessoas = useMemo(() => reservasFiltradas.reduce((soma, r) => soma + r.numPessoas, 0), [reservasFiltradas]);
  // Resumo de lugares por faixa de tamanho (rodape) - conta todas as reservas do dia
  // que ainda valem (nao canceladas), independente da aba/busca selecionada no momento.
  const resumoPorTamanho = useMemo(() => {
    const ativas = reservas.filter((r) => r.status !== "cancelada");
    return FAIXAS_TAMANHO.map((faixa) => ({
      ...faixa,
      quantidade: ativas.filter((r) => r.numPessoas >= faixa.min && r.numPessoas <= faixa.max).length,
    })).filter((f) => f.quantidade > 0);
  }, [reservas]);
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
        <input
          type="search"
          className="busca-reservas"
          placeholder="Pesquisar por nome ou telefone"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Pesquisar reservas"
        />
      </div>

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
          <Link className="btn btn-secundario" to="/admin/bloqueios">
            Ver bloqueios
          </Link>
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
          {GRUPOS.map((g) => (
            <button key={g} type="button" className={`aba-status ${grupo === g ? "ativa" : ""}`} onClick={() => setGrupo(g)}>
              {GRUPO_LABEL[g]}
              <span className="texto-secundario"> ({contarNoGrupo(reservas, g)})</span>
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <span className="texto-secundario">
            {reservasFiltradas.length} reserva(s) ({totalPessoas} pessoas)
          </span>
        </div>

        {reservasAtrasadas.length > 0 && (
          <div className="aviso-atrasadas">
            <span>
              Você tem {reservasAtrasadas.length} reserva(s) que já passaram do horário e não foram marcadas como sentada ou não
              compareceu.
            </span>
            <button type="button" className="btn btn-secundario" onClick={() => setGrupo("recebidas")}>
              Ver reservas
            </button>
          </div>
        )}

        {carregando ? (
          <p>Carregando...</p>
        ) : reservas.length === 0 ? (
          <p className="texto-secundario">Nenhuma reserva para esta data.</p>
        ) : reservasFiltradas.length === 0 ? (
          <p className="texto-secundario">Nenhuma reserva encontrada.</p>
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
                  {reserva.clienteTelefone && (
                    <>
                      {" - "}
                      <a href={`tel:${reserva.clienteTelefone}`}>{reserva.clienteTelefone}</a>
                    </>
                  )}
                </div>
                {STATUS_ATIVOS.has(reserva.status) && (
                  <div className="reserva-card-mobile-acoes">
                    <button className="btn" onClick={() => marcarStatus(reserva, "concluida")}>
                      Sentar
                    </button>
                    <button className="btn btn-secundario" onClick={() => marcarStatus(reserva, "no_show")}>
                      Nao compareceu
                    </button>
                    {reserva.clienteTelefone && (
                      <a
                        className="btn btn-whatsapp"
                        href={linkWhatsApp(reserva.clienteTelefone)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <IconeWhatsApp />
                        WhatsApp
                      </a>
                    )}
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
          <div className="tabela-scroll">
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
                    {reserva.clienteTelefone && (
                      <div className="texto-secundario" style={{ fontSize: "0.8rem" }}>
                        <a href={`tel:${reserva.clienteTelefone}`}>{reserva.clienteTelefone}</a>
                      </div>
                    )}
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
                          <button className="btn" onClick={() => marcarStatus(reserva, "concluida")}>
                            Sentar
                          </button>
                          <button className="btn btn-secundario" onClick={() => marcarStatus(reserva, "no_show")}>
                            Nao compareceu
                          </button>
                        </>
                      )}
                      {reserva.clienteTelefone && (
                        <a
                          className="btn btn-whatsapp"
                          href={linkWhatsApp(reserva.clienteTelefone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Iniciar conversa no WhatsApp"
                        >
                          <IconeWhatsApp />
                          WhatsApp
                        </a>
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
          </div>
          </>
        )}
      </div>

      {resumoPorTamanho.length > 0 && (
        <div className="cartao resumo-tamanhos">
          <span className="texto-secundario" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
            Reservas do dia por tamanho de grupo:
          </span>
          <div className="resumo-tamanhos-lista">
            {resumoPorTamanho.map((faixa) => (
              <div key={faixa.label} className="resumo-tamanho-item">
                <strong>{faixa.quantidade}</strong>
                <span>
                  {faixa.label}
                  <br />
                  lugares
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
