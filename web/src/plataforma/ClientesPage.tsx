import { useEffect, useState } from "react";
import { ApiError } from "../api/client.js";
import { atualizarCliente, listarClientes, redefinirSenhaOwner } from "./resources.js";
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
  const [redefinindoId, setRedefinindoId] = useState<string | null>(null);
  const [novoEmail, setNovoEmail] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [mensagemRedefinicao, setMensagemRedefinicao] = useState<string | null>(null);

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

  function abrirRedefinicao(cliente: Cliente) {
    setRedefinindoId(cliente.id);
    setNovoEmail("");
    setNovaSenha("");
    setMensagemRedefinicao(null);
    setErro(null);
  }

  async function confirmarRedefinicao(cliente: Cliente) {
    setErro(null);
    setMensagemRedefinicao(null);
    try {
      const atualizado = await redefinirSenhaOwner(cliente.id, {
        senha: novaSenha,
        ...(novoEmail.trim() && { email: novoEmail.trim() }),
      });
      setMensagemRedefinicao(`Senha redefinida. Login: ${atualizado.email ?? atualizado.username}.`);
      setClientes((lista) =>
        lista.map((c) => (c.id === cliente.id ? { ...c, contato: { nome: c.contato?.nome ?? "Administrador", email: atualizado.email ?? "" } } : c)),
      );
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel redefinir a senha.");
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
          <div className="tabela-scroll">
          <table>
            <thead>
              <tr>
                <th>Restaurante</th>
                <th>Contato</th>
                <th>Plano</th>
                <th>Assinatura</th>
                <th>Desde</th>
                <th>Acesso</th>
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
                  <td>
                    {redefinindoId === cliente.id ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", minWidth: "220px" }}>
                        <input
                          type="email"
                          placeholder="novo e-mail (opcional)"
                          value={novoEmail}
                          onChange={(e) => setNovoEmail(e.target.value)}
                        />
                        <input
                          type="text"
                          placeholder="nova senha (min. 8 caracteres)"
                          value={novaSenha}
                          onChange={(e) => setNovaSenha(e.target.value)}
                        />
                        {mensagemRedefinicao && <p className="texto-secundario" style={{ fontSize: "0.8rem" }}>{mensagemRedefinicao}</p>}
                        <div style={{ display: "flex", gap: "0.4rem" }}>
                          <button type="button" className="btn" disabled={novaSenha.length < 8} onClick={() => confirmarRedefinicao(cliente)}>
                            Salvar
                          </button>
                          <button type="button" className="btn btn-secundario" onClick={() => setRedefinindoId(null)}>
                            Fechar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" className="btn btn-secundario" onClick={() => abrirRedefinicao(cliente)}>
                        Redefinir senha do dono
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
    </div>
  );
}
