import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.js";
import { ApiError } from "../api/client.js";
import { adicionarNaFilaEspera, atualizarStatusFilaEspera, listarFilaEspera, removerDaFilaEspera } from "../api/resources.js";
import { IconeWhatsApp } from "../components/IconeWhatsApp.js";
import { linkWhatsApp } from "../lib/whatsapp.js";
import type { FilaEsperaEntrada, FilaEsperaStatus } from "../types.js";

const STATUS_LABEL: Record<FilaEsperaStatus, string> = {
  esperando: "Esperando",
  chamado: "Chamado",
  sentado: "Sentou",
  desistiu: "Desistiu",
};

interface FormState {
  clienteNome: string;
  clienteTelefone: string;
  numPessoas: string;
  observacoes: string;
}

const FORM_VAZIO: FormState = { clienteNome: "", clienteTelefone: "", numPessoas: "2", observacoes: "" };

function minutosDeEspera(criadoEm: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(criadoEm).getTime()) / 60000));
}

export function WaitingListPage() {
  const { unidade } = useAuth();
  const [entradas, setEntradas] = useState<FilaEsperaEntrada[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [verHistorico, setVerHistorico] = useState(false);

  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    if (!unidade) return;
    setCarregando(true);
    setErro(null);
    try {
      const lista = await listarFilaEspera(unidade.id, verHistorico);
      setEntradas(lista);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível carregar a fila de espera.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidade?.id, verHistorico]);

  // Atualiza o tempo de espera exibido a cada minuto, sem precisar recarregar do servidor.
  useEffect(() => {
    const intervalo = setInterval(() => setEntradas((atual) => [...atual]), 60_000);
    return () => clearInterval(intervalo);
  }, []);

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!unidade || !form.clienteNome.trim()) return;
    setSalvando(true);
    try {
      await adicionarNaFilaEspera(unidade.id, {
        clienteNome: form.clienteNome.trim(),
        clienteTelefone: form.clienteTelefone.trim() || undefined,
        numPessoas: Number(form.numPessoas),
        observacoes: form.observacoes.trim() || undefined,
      });
      setForm(FORM_VAZIO);
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível adicionar à fila.");
    } finally {
      setSalvando(false);
    }
  }

  async function mudarStatus(entrada: FilaEsperaEntrada, status: FilaEsperaStatus) {
    if (!unidade) return;
    try {
      await atualizarStatusFilaEspera(unidade.id, entrada.id, status);
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível atualizar o status.");
    }
  }

  async function remover(entrada: FilaEsperaEntrada) {
    if (!unidade) return;
    if (!confirm(`Remover ${entrada.clienteNome} da fila?`)) return;
    try {
      await removerDaFilaEspera(unidade.id, entrada.id);
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível remover da fila.");
    }
  }

  if (!unidade) return <p>Carregando unidade...</p>;

  return (
    <div>
      {erro && <p className="erro">{erro}</p>}

      <div className="cartao">
        <h3 style={{ marginTop: 0 }}>Fila de espera</h3>
        <p className="texto-secundario" style={{ fontSize: "0.85rem", marginTop: 0 }}>
          Para clientes que chegaram sem reserva e estão esperando mesa vagar. Se informar o telefone, ao clicar em
          "Chamar" o sistema tenta avisar o cliente por WhatsApp automaticamente (quando conectado).
        </p>
        <form className="linha-form" onSubmit={adicionar}>
          <label>
            Nome
            <input value={form.clienteNome} onChange={(e) => setForm({ ...form, clienteNome: e.target.value })} required />
          </label>
          <label>
            Telefone (opcional)
            <input value={form.clienteTelefone} onChange={(e) => setForm({ ...form, clienteTelefone: e.target.value })} placeholder="43988414050" />
          </label>
          <label>
            Pessoas
            <input
              type="number"
              min={1}
              value={form.numPessoas}
              onChange={(e) => setForm({ ...form, numPessoas: e.target.value })}
              required
            />
          </label>
          <label style={{ flex: 1 }}>
            Observações
            <input value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} placeholder="Ex: prefere mesa na janela" />
          </label>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="btn" type="submit" disabled={salvando}>
              Adicionar à fila
            </button>
          </div>
        </form>
      </div>

      <div className="cartao">
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <h3 style={{ margin: 0, flex: 1 }}>{verHistorico ? "Histórico completo" : "Na fila agora"}</h3>
          <button className="btn btn-secundario" onClick={() => setVerHistorico((v) => !v)}>
            {verHistorico ? "Ver só quem está esperando" : "Ver histórico"}
          </button>
        </div>
        {carregando ? (
          <p>Carregando...</p>
        ) : entradas.length === 0 ? (
          <p className="texto-secundario">{verHistorico ? "Nenhum registro ainda." : "Ninguém esperando no momento."}</p>
        ) : (
          <div className="tabela-scroll">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Pessoas</th>
                <th>Espera</th>
                <th>Status</th>
                <th>Observações</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entradas.map((entrada) => (
                <tr key={entrada.id}>
                  <td>
                    {entrada.clienteNome}
                    {entrada.clienteTelefone && (
                      <div className="texto-secundario" style={{ fontSize: "0.8rem" }}>
                        <a href={`tel:${entrada.clienteTelefone}`}>{entrada.clienteTelefone}</a>
                      </div>
                    )}
                  </td>
                  <td>{entrada.numPessoas}</td>
                  <td>{minutosDeEspera(entrada.criadoEm)} min</td>
                  <td>
                    <span className={`badge badge-${entrada.status}`}>{STATUS_LABEL[entrada.status]}</span>
                  </td>
                  <td className="texto-secundario" style={{ fontSize: "0.85rem" }}>
                    {entrada.observacoes ?? "-"}
                  </td>
                  <td>
                    <div className="acoes">
                      {entrada.status === "esperando" && (
                        <button className="btn btn-secundario" onClick={() => mudarStatus(entrada, "chamado")}>
                          Chamar
                        </button>
                      )}
                      {(entrada.status === "esperando" || entrada.status === "chamado") && (
                        <>
                          <button className="btn btn-secundario" onClick={() => mudarStatus(entrada, "sentado")}>
                            Sentou
                          </button>
                          <button className="btn btn-perigo" onClick={() => mudarStatus(entrada, "desistiu")}>
                            Desistiu
                          </button>
                        </>
                      )}
                      <button className="btn btn-secundario" onClick={() => remover(entrada)}>
                        Remover
                      </button>
                      {entrada.clienteTelefone && (
                        <a
                          className="btn btn-whatsapp"
                          href={linkWhatsApp(entrada.clienteTelefone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Iniciar conversa no WhatsApp"
                        >
                          <IconeWhatsApp />
                          WhatsApp
                        </a>
                      )}
                    </div>
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
