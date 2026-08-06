import { useEffect, useState } from "react";
import { ApiError } from "../api/client.js";
import { atualizarCliente, listarClientes } from "./resources.js";
import type { AssinaturaStatus, Cliente } from "./types.js";

const STATUS_LABEL: Record<AssinaturaStatus, string> = {
  em_teste: "Em teste",
  ativo: "Ativo",
  cancelado: "Cancelado",
  suspenso: "Suspenso",
};

const STATUS_OPCOES: AssinaturaStatus[] = ["em_teste", "ativo", "suspenso", "cancelado"];

export function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      setClientes(await listarClientes());
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel carregar os clientes.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function mudarStatus(cliente: Cliente, status: AssinaturaStatus) {
    setSalvandoId(cliente.id);
    setErro(null);
    try {
      const atualizado = await atualizarCliente(cliente.id, { assinaturaStatus: status });
      // O PATCH devolve so a linha de "empresas" (sem o "contato", que e derivado via
      // join no GET) - mescla por cima do que ja tinha em vez de substituir o objeto
      // inteiro, senao a coluna de contato "desaparece" da tela ate o proximo reload.
      setClientes((lista) => lista.map((c) => (c.id === cliente.id ? { ...c, ...atualizado } : c)));
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel atualizar o status.");
    } finally {
      setSalvandoId(null);
    }
  }

  return (
    <div>
      {erro && <p className="erro">{erro}</p>}
      <div className="cartao">
        <h3 style={{ marginTop: 0 }}>Clientes</h3>
        {carregando ? (
          <p>Carregando...</p>
        ) : clientes.length === 0 ? (
          <p className="texto-secundario">Nenhum cliente ainda. Converta um lead na aba "Lista de espera".</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Restaurante</th>
                <th>Contato</th>
                <th>Plano</th>
                <th>Assinatura</th>
                <th>Desde</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((cliente) => (
                <tr key={cliente.id}>
                  <td>{cliente.nome}</td>
                  <td>
                    {cliente.contato ? (
                      <>
                        {cliente.contato.nome}
                        <div className="texto-secundario" style={{ fontSize: "0.8rem" }}>
                          {cliente.contato.email}
                        </div>
                      </>
                    ) : (
                      <span className="texto-secundario">Sem login ainda</span>
                    )}
                  </td>
                  <td>{cliente.plano}</td>
                  <td>
                    <select
                      value={cliente.assinaturaStatus}
                      disabled={salvandoId === cliente.id}
                      onChange={(e) => mudarStatus(cliente, e.target.value as AssinaturaStatus)}
                    >
                      {STATUS_OPCOES.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABEL[status]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{cliente.criadoEm.slice(0, 10).split("-").reverse().join("/")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
