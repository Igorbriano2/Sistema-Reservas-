import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.js";
import { ApiError } from "../api/client.js";
import { criarBloqueio, listarBloqueios, listarMesas, listarSaloes, removerBloqueio } from "../api/resources.js";
import type { Bloqueio, Mesa, Salao } from "../types.js";

type TipoAlvo = "mesa" | "salao";

interface FormState {
  tipo: TipoAlvo;
  alvoId: string;
  dataInicio: string;
  dataFim: string;
  motivo: string;
}

const FORM_VAZIO: FormState = { tipo: "mesa", alvoId: "", dataInicio: "", dataFim: "", motivo: "" };

export function BlocksPage() {
  const { unidade } = useAuth();
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [saloes, setSaloes] = useState<Salao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  const mesasPorId = useMemo(() => new Map(mesas.map((m) => [m.id, m])), [mesas]);
  const saloesPorId = useMemo(() => new Map(saloes.map((s) => [s.id, s])), [saloes]);

  async function carregar() {
    if (!unidade) return;
    setCarregando(true);
    setErro(null);
    try {
      const [listaBloqueios, listaMesas, listaSaloes] = await Promise.all([
        listarBloqueios(unidade.id),
        listarMesas(unidade.id),
        listarSaloes(unidade.id),
      ]);
      setBloqueios(listaBloqueios);
      setMesas(listaMesas);
      setSaloes(listaSaloes);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel carregar os bloqueios.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidade?.id]);

  function opcoesDoTipo(tipo: TipoAlvo) {
    return tipo === "mesa" ? mesas.map((m) => ({ id: m.id, nome: m.nome })) : saloes.map((s) => ({ id: s.id, nome: s.nome }));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!unidade) return;
    setSalvando(true);
    setErroForm(null);
    try {
      await criarBloqueio(unidade.id, {
        mesaId: form.tipo === "mesa" ? form.alvoId : undefined,
        salaoId: form.tipo === "salao" ? form.alvoId : undefined,
        dataInicio: form.dataInicio,
        dataFim: form.dataFim,
        motivo: form.motivo,
      });
      setForm(FORM_VAZIO);
      await carregar();
    } catch (err) {
      setErroForm(err instanceof ApiError ? err.message : "Nao foi possivel criar o bloqueio.");
    } finally {
      setSalvando(false);
    }
  }

  async function remover(bloqueio: Bloqueio) {
    if (!unidade) return;
    if (!confirm("Remover este bloqueio?")) return;
    try {
      await removerBloqueio(unidade.id, bloqueio.id);
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel remover o bloqueio.");
    }
  }

  function nomeDoAlvo(bloqueio: Bloqueio): string {
    if (bloqueio.mesaId) return `Mesa: ${mesasPorId.get(bloqueio.mesaId)?.nome ?? "-"}`;
    return `Salão inteiro: ${saloesPorId.get(bloqueio.salaoId!)?.nome ?? "-"}`;
  }

  function formatarData(data: string): string {
    return data.split("-").reverse().join("/");
  }

  if (!unidade) return <p>Carregando unidade...</p>;

  return (
    <div>
      {erro && <p className="erro">{erro}</p>}

      <div className="cartao">
        <h3 style={{ marginTop: 0 }}>Novo bloqueio</h3>
        <p className="texto-secundario" style={{ marginTop: 0, fontSize: "0.85rem" }}>
          Bloqueia uma mesa ou um salão inteiro por um período (manutenção, evento privado, etc). Reservas não podem
          ser criadas nesse período para o que for bloqueado.
        </p>
        <form onSubmit={salvar}>
          <div className="linha-form">
            <label>
              Bloquear
              <select
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoAlvo, alvoId: "" })}
              >
                <option value="mesa">Uma mesa</option>
                <option value="salao">Um salão inteiro</option>
              </select>
            </label>
            <label>
              {form.tipo === "mesa" ? "Mesa" : "Salão"}
              <select value={form.alvoId} onChange={(e) => setForm({ ...form, alvoId: e.target.value })} required>
                <option value="" disabled>
                  Selecione
                </option>
                {opcoesDoTipo(form.tipo).map((opcao) => (
                  <option key={opcao.id} value={opcao.id}>
                    {opcao.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="linha-form">
            <label>
              Data inicial
              <input
                type="date"
                value={form.dataInicio}
                onChange={(e) => setForm({ ...form, dataInicio: e.target.value })}
                required
              />
            </label>
            <label>
              Data final
              <input
                type="date"
                value={form.dataFim}
                min={form.dataInicio || undefined}
                onChange={(e) => setForm({ ...form, dataFim: e.target.value })}
                required
              />
            </label>
          </div>
          <label style={{ marginBottom: "0.75rem" }}>
            Motivo
            <input
              value={form.motivo}
              onChange={(e) => setForm({ ...form, motivo: e.target.value })}
              placeholder="Ex: Manutenção elétrica"
              required
            />
          </label>
          {erroForm && <p className="erro">{erroForm}</p>}
          <button className="btn" type="submit" disabled={salvando}>
            {salvando ? "Salvando..." : "Criar bloqueio"}
          </button>
        </form>
      </div>

      <div className="cartao">
        <h3 style={{ marginTop: 0 }}>Bloqueios ativos</h3>
        {carregando ? (
          <p>Carregando...</p>
        ) : bloqueios.length === 0 ? (
          <p className="texto-secundario">Nenhum bloqueio ativo no momento.</p>
        ) : (
          <div className="tabela-scroll">
          <table>
            <thead>
              <tr>
                <th>Alvo</th>
                <th>Período</th>
                <th>Motivo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bloqueios.map((bloqueio) => (
                <tr key={bloqueio.id}>
                  <td>{nomeDoAlvo(bloqueio)}</td>
                  <td>
                    {formatarData(bloqueio.dataInicio)} – {formatarData(bloqueio.dataFim)}
                  </td>
                  <td>{bloqueio.motivo}</td>
                  <td>
                    <button className="btn btn-perigo" onClick={() => remover(bloqueio)}>
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
