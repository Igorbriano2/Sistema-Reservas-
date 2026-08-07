import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.js";
import { ApiError } from "../api/client.js";
import {
  atualizarRegraHorario,
  criarRegraHorario,
  excluirRegraHorario,
  listarRegrasHorario,
} from "../api/resources.js";
import type { RegraHorario } from "../types.js";

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

interface FormState {
  diaSemana: number;
  nome: string;
  horaAbertura: string;
  horaFechamento: string;
  duracaoPadraoMin: string;
  bufferMin: string;
  antecedenciaMinMin: string;
  descontoPercentual: string;
}

const FORM_VAZIO: FormState = {
  diaSemana: 1,
  nome: "",
  horaAbertura: "",
  horaFechamento: "",
  duracaoPadraoMin: "90",
  bufferMin: "0",
  antecedenciaMinMin: "0",
  descontoPercentual: "",
};

function regraParaForm(regra: RegraHorario): FormState {
  return {
    diaSemana: regra.diaSemana,
    nome: regra.nome ?? "",
    horaAbertura: regra.horaAbertura.slice(0, 5),
    horaFechamento: regra.horaFechamento.slice(0, 5),
    duracaoPadraoMin: String(regra.duracaoPadraoMin),
    bufferMin: String(regra.bufferMin),
    antecedenciaMinMin: String(regra.antecedenciaMinMin),
    descontoPercentual: regra.descontoPercentual != null ? String(regra.descontoPercentual) : "",
  };
}

function formParaDados(form: FormState) {
  return {
    diaSemana: form.diaSemana,
    nome: form.nome.trim() || undefined,
    horaAbertura: form.horaAbertura,
    horaFechamento: form.horaFechamento,
    duracaoPadraoMin: form.duracaoPadraoMin ? Number(form.duracaoPadraoMin) : undefined,
    bufferMin: form.bufferMin ? Number(form.bufferMin) : undefined,
    antecedenciaMinMin: form.antecedenciaMinMin ? Number(form.antecedenciaMinMin) : undefined,
    descontoPercentual: form.descontoPercentual ? Number(form.descontoPercentual) : undefined,
  };
}

function formatarAntecedencia(min: number): string {
  if (min <= 0) return "sem restrição";
  const horas = Math.floor(min / 60);
  const minutos = min % 60;
  return [horas > 0 && `${horas}h`, minutos > 0 && `${minutos}min`].filter(Boolean).join(" ");
}

export function SchedulePage() {
  const { unidade } = useAuth();
  const [regras, setRegras] = useState<RegraHorario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formEdicao, setFormEdicao] = useState<FormState>(FORM_VAZIO);

  async function carregar() {
    if (!unidade) return;
    setCarregando(true);
    setErro(null);
    try {
      const lista = await listarRegrasHorario(unidade.id);
      setRegras(lista);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível carregar os horários.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidade?.id]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!unidade || !form.horaAbertura || !form.horaFechamento) return;
    setSalvando(true);
    setErroForm(null);
    try {
      await criarRegraHorario(unidade.id, formParaDados(form));
      setForm({ ...FORM_VAZIO, diaSemana: form.diaSemana });
      await carregar();
    } catch (err) {
      setErroForm(err instanceof ApiError ? err.message : "Não foi possível criar o turno.");
    } finally {
      setSalvando(false);
    }
  }

  function abrirEdicao(regra: RegraHorario) {
    setEditandoId(regra.id);
    setFormEdicao(regraParaForm(regra));
  }

  async function salvarEdicao(e: React.FormEvent) {
    e.preventDefault();
    if (!unidade || !editandoId) return;
    try {
      await atualizarRegraHorario(unidade.id, editandoId, formParaDados(formEdicao));
      setEditandoId(null);
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível atualizar o turno.");
    }
  }

  async function excluir(regra: RegraHorario) {
    if (!unidade) return;
    if (!confirm(`Excluir o turno de ${DIAS_SEMANA[regra.diaSemana]}${regra.nome ? ` (${regra.nome})` : ""}?`)) return;
    try {
      await excluirRegraHorario(unidade.id, regra.id);
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível excluir o turno.");
    }
  }

  if (!unidade) return <p>Carregando unidade...</p>;

  return (
    <div>
      {erro && <p className="erro">{erro}</p>}

      <div className="cartao">
        <h3 style={{ marginTop: 0 }}>Horários e turnos</h3>
        <p className="texto-secundario" style={{ fontSize: "0.85rem", marginTop: 0 }}>
          Cadastre os horários de funcionamento por dia da semana. Você pode criar mais de um turno no mesmo dia (ex:
          Almoço e Jantar), cada um com nome, antecedência mínima para reservar e desconto opcional (informativo).
        </p>
        <form onSubmit={salvar}>
          <div className="linha-form">
            <label>
              Dia da semana
              <select value={form.diaSemana} onChange={(e) => setForm({ ...form, diaSemana: Number(e.target.value) })}>
                {DIAS_SEMANA.map((nome, i) => (
                  <option key={i} value={i}>
                    {nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nome do turno (opcional)
              <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Almoço" />
            </label>
            <label>
              Abre
              <input type="time" value={form.horaAbertura} onChange={(e) => setForm({ ...form, horaAbertura: e.target.value })} required />
            </label>
            <label>
              Fecha
              <input type="time" value={form.horaFechamento} onChange={(e) => setForm({ ...form, horaFechamento: e.target.value })} required />
            </label>
          </div>
          <div className="linha-form">
            <label>
              Duração padrão da reserva (min)
              <input
                type="number"
                min={1}
                value={form.duracaoPadraoMin}
                onChange={(e) => setForm({ ...form, duracaoPadraoMin: e.target.value })}
              />
            </label>
            <label>
              Intervalo entre reservas na mesma mesa (min)
              <input type="number" min={0} value={form.bufferMin} onChange={(e) => setForm({ ...form, bufferMin: e.target.value })} />
            </label>
            <label>
              Antecedência mínima (min)
              <input
                type="number"
                min={0}
                value={form.antecedenciaMinMin}
                onChange={(e) => setForm({ ...form, antecedenciaMinMin: e.target.value })}
              />
            </label>
            <label>
              Desconto (%, opcional)
              <input
                type="number"
                min={0}
                max={100}
                value={form.descontoPercentual}
                onChange={(e) => setForm({ ...form, descontoPercentual: e.target.value })}
              />
            </label>
          </div>
          {erroForm && <p className="erro">{erroForm}</p>}
          <button className="btn" type="submit" disabled={salvando}>
            {salvando ? "Salvando..." : "Adicionar turno"}
          </button>
        </form>
      </div>

      <div className="cartao">
        <h3 style={{ marginTop: 0 }}>Turnos cadastrados</h3>
        {carregando ? (
          <p>Carregando...</p>
        ) : regras.length === 0 ? (
          <p className="texto-secundario">Nenhum turno cadastrado ainda. Sem isso, a unidade aparece sem horário de funcionamento.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Dia</th>
                <th>Turno</th>
                <th>Horário</th>
                <th>Antecedência</th>
                <th>Desconto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {[...regras]
                .sort((a, b) => a.diaSemana - b.diaSemana || a.horaAbertura.localeCompare(b.horaAbertura))
                .map((regra) =>
                  editandoId === regra.id ? (
                    <tr key={regra.id}>
                      <td colSpan={6}>
                        <form onSubmit={salvarEdicao}>
                          <div className="linha-form">
                            <label>
                              Dia da semana
                              <select
                                value={formEdicao.diaSemana}
                                onChange={(e) => setFormEdicao({ ...formEdicao, diaSemana: Number(e.target.value) })}
                              >
                                {DIAS_SEMANA.map((nome, i) => (
                                  <option key={i} value={i}>
                                    {nome}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Nome do turno
                              <input value={formEdicao.nome} onChange={(e) => setFormEdicao({ ...formEdicao, nome: e.target.value })} />
                            </label>
                            <label>
                              Abre
                              <input
                                type="time"
                                value={formEdicao.horaAbertura}
                                onChange={(e) => setFormEdicao({ ...formEdicao, horaAbertura: e.target.value })}
                                required
                              />
                            </label>
                            <label>
                              Fecha
                              <input
                                type="time"
                                value={formEdicao.horaFechamento}
                                onChange={(e) => setFormEdicao({ ...formEdicao, horaFechamento: e.target.value })}
                                required
                              />
                            </label>
                          </div>
                          <div className="linha-form">
                            <label>
                              Duração (min)
                              <input
                                type="number"
                                min={1}
                                value={formEdicao.duracaoPadraoMin}
                                onChange={(e) => setFormEdicao({ ...formEdicao, duracaoPadraoMin: e.target.value })}
                              />
                            </label>
                            <label>
                              Intervalo (min)
                              <input
                                type="number"
                                min={0}
                                value={formEdicao.bufferMin}
                                onChange={(e) => setFormEdicao({ ...formEdicao, bufferMin: e.target.value })}
                              />
                            </label>
                            <label>
                              Antecedência mínima (min)
                              <input
                                type="number"
                                min={0}
                                value={formEdicao.antecedenciaMinMin}
                                onChange={(e) => setFormEdicao({ ...formEdicao, antecedenciaMinMin: e.target.value })}
                              />
                            </label>
                            <label>
                              Desconto (%)
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={formEdicao.descontoPercentual}
                                onChange={(e) => setFormEdicao({ ...formEdicao, descontoPercentual: e.target.value })}
                              />
                            </label>
                          </div>
                          <div className="acoes">
                            <button className="btn" type="submit">
                              Salvar
                            </button>
                            <button className="btn btn-secundario" type="button" onClick={() => setEditandoId(null)}>
                              Cancelar
                            </button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  ) : (
                    <tr key={regra.id}>
                      <td>{DIAS_SEMANA[regra.diaSemana]}</td>
                      <td>{regra.nome ?? "-"}</td>
                      <td>
                        {regra.horaAbertura.slice(0, 5)} – {regra.horaFechamento.slice(0, 5)}
                      </td>
                      <td>{formatarAntecedencia(regra.antecedenciaMinMin)}</td>
                      <td>{regra.descontoPercentual != null ? `${regra.descontoPercentual}%` : "-"}</td>
                      <td>
                        <div className="acoes">
                          <button className="btn btn-secundario" onClick={() => abrirEdicao(regra)}>
                            Editar
                          </button>
                          <button className="btn btn-perigo" onClick={() => excluir(regra)}>
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ),
                )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
