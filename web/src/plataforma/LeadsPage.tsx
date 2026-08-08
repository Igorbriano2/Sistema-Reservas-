import { useEffect, useState } from "react";
import { ApiError } from "../api/client.js";
import { atualizarStatusDoLead, converterLead, listarLeads } from "./resources.js";
import type { Lead, LeadStatus } from "./types.js";

const STATUS_LABEL: Record<LeadStatus, string> = {
  novo: "Novo",
  contatado: "Contatado",
  convertido: "Convertido",
  descartado: "Descartado",
};

const STATUS_OPCOES: LeadStatus[] = ["novo", "contatado", "descartado"];

export function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  const [convertendoId, setConvertendoId] = useState<string | null>(null);
  const [senhaConversao, setSenhaConversao] = useState("");
  const [erroConversao, setErroConversao] = useState<string | null>(null);
  const [enviandoConversao, setEnviandoConversao] = useState(false);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      setLeads(await listarLeads());
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel carregar a lista de espera.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function mudarStatus(lead: Lead, status: LeadStatus) {
    setSalvandoId(lead.id);
    setErro(null);
    try {
      const atualizado = await atualizarStatusDoLead(lead.id, status);
      setLeads((lista) => lista.map((l) => (l.id === lead.id ? atualizado : l)));
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel atualizar o status.");
    } finally {
      setSalvandoId(null);
    }
  }

  function abrirConversao(lead: Lead) {
    setConvertendoId(lead.id);
    setSenhaConversao("");
    setErroConversao(null);
  }

  async function confirmarConversao(lead: Lead) {
    setEnviandoConversao(true);
    setErroConversao(null);
    try {
      const { lead: leadAtualizado } = await converterLead(lead.id, senhaConversao);
      setLeads((lista) => lista.map((l) => (l.id === lead.id ? leadAtualizado : l)));
      setConvertendoId(null);
    } catch (err) {
      setErroConversao(err instanceof ApiError ? err.message : "Nao foi possivel converter o lead.");
    } finally {
      setEnviandoConversao(false);
    }
  }

  return (
    <div>
      {erro && <p className="erro">{erro}</p>}
      <div className="cartao">
        <h3 style={{ marginTop: 0 }}>Lista de espera</h3>
        <p className="texto-secundario" style={{ marginTop: 0, fontSize: "0.85rem" }}>
          Contatos que preencheram o formulário da landing page.
        </p>
        {carregando ? (
          <p>Carregando...</p>
        ) : leads.length === 0 ? (
          <p className="texto-secundario">Nenhum contato ainda.</p>
        ) : (
          <div className="tabela-scroll">
          <table>
            <thead>
              <tr>
                <th>Restaurante</th>
                <th>Contato</th>
                <th>Status</th>
                <th>Recebido em</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <td>{lead.nomeRestaurante}</td>
                  <td>
                    {lead.nome}
                    <div className="texto-secundario" style={{ fontSize: "0.8rem" }}>
                      {lead.email} · {lead.whatsapp}
                    </div>
                  </td>
                  <td>
                    {lead.status === "convertido" ? (
                      <span className="badge badge-confirmada">Convertido</span>
                    ) : (
                      <select
                        value={lead.status}
                        disabled={salvandoId === lead.id}
                        onChange={(e) => mudarStatus(lead, e.target.value as LeadStatus)}
                      >
                        {STATUS_OPCOES.map((status) => (
                          <option key={status} value={status}>
                            {STATUS_LABEL[status]}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>{lead.criadoEm.slice(0, 10).split("-").reverse().join("/")}</td>
                  <td>
                    {lead.status !== "convertido" && (
                      <button className="btn btn-secundario" onClick={() => abrirConversao(lead)}>
                        Converter em cliente
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {convertendoId && (
        <div className="cartao">
          <h3 style={{ marginTop: 0 }}>Converter em cliente</h3>
          <p className="texto-secundario" style={{ marginTop: 0, fontSize: "0.85rem" }}>
            Cria a empresa e o primeiro login (dono) com os dados do contato. Defina uma senha inicial - combine com o
            cliente depois por um canal seguro.
          </p>
          <label style={{ marginBottom: "0.75rem", maxWidth: 320 }}>
            Senha inicial
            <input
              type="password"
              value={senhaConversao}
              onChange={(e) => setSenhaConversao(e.target.value)}
              minLength={8}
              required
            />
          </label>
          {erroConversao && <p className="erro">{erroConversao}</p>}
          <div className="acoes">
            <button
              className="btn"
              disabled={enviandoConversao || senhaConversao.length < 8}
              onClick={() => confirmarConversao(leads.find((l) => l.id === convertendoId)!)}
            >
              {enviandoConversao ? "Criando..." : "Criar cliente"}
            </button>
            <button className="btn btn-secundario" onClick={() => setConvertendoId(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
