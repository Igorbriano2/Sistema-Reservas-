import { useEffect, useState } from "react";
import { ApiError } from "../api/client.js";
import { atualizarCliente, editarLoginOwner, excluirCliente, listarClientes } from "./resources.js";
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
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [mensagemEdicao, setMensagemEdicao] = useState<string | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

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

  function abrirEdicao(cliente: Cliente) {
    setEditandoId(cliente.id);
    setNovoNome(cliente.contato?.nome ?? "");
    setNovoEmail("");
    setNovaSenha("");
    setMensagemEdicao(null);
    setErro(null);
  }

  async function confirmarEdicao(cliente: Cliente) {
    setErro(null);
    setMensagemEdicao(null);
    const dados = {
      ...(novoNome.trim() && novoNome.trim() !== cliente.contato?.nome && { nome: novoNome.trim() }),
      ...(novoEmail.trim() && { email: novoEmail.trim() }),
      ...(novaSenha && { senha: novaSenha }),
    };
    if (Object.keys(dados).length === 0) {
      setErro("Altere ao menos um campo (nome, e-mail ou senha).");
      return;
    }
    try {
      const atualizado = await editarLoginOwner(cliente.id, dados);
      setMensagemEdicao(`Login atualizado: ${atualizado.email ?? atualizado.username}.`);
      setClientes((lista) =>
        lista.map((c) =>
          c.id === cliente.id
            ? { ...c, contato: { nome: atualizado.nome, email: atualizado.email ?? c.contato?.email ?? "" } }
            : c,
        ),
      );
      setNovaSenha("");
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel salvar as alteracoes.");
    }
  }

  async function excluirConta(cliente: Cliente) {
    const digitado = window.prompt(
      `Isso apaga PRA SEMPRE o restaurante "${cliente.nome}" e tudo dele (reservas, usuarios, cardapio, conversas). Nao tem como desfazer.\n\nPra confirmar, digite o nome exato do restaurante: ${cliente.nome}`,
    );
    if (digitado !== cliente.nome) {
      if (digitado !== null) setErro("Nome digitado nao confere - exclusao cancelada.");
      return;
    }
    setExcluindoId(cliente.id);
    setErro(null);
    try {
      await excluirCliente(cliente.id);
      setClientes((lista) => lista.filter((c) => c.id !== cliente.id));
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel excluir a conta.");
    } finally {
      setExcluindoId(null);
    }
  }

  return (
    <div>
      {erro && <p className="erro">{erro}</p>}
      <div className="cartao">
        <h3 style={{ marginTop: 0 }}>Clientes</h3>
        <p className="texto-secundario" style={{ fontSize: "0.85rem", marginTop: 0 }}>
          "Assinatura / Acesso" controla se o restaurante consegue usar o painel: "Suspenso" ou "Cancelado" bloqueia o
          acesso imediatamente (util pra assinaturas pagas via Pix, fora do controle automatico da Stripe).
        </p>
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
                <th>Assinatura / Acesso</th>
                <th>Desde</th>
                <th>Login do dono</th>
                <th></th>
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
                    {editandoId === cliente.id ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", minWidth: "220px" }}>
                        <input
                          type="text"
                          placeholder="nome do dono"
                          value={novoNome}
                          onChange={(e) => setNovoNome(e.target.value)}
                        />
                        <input
                          type="email"
                          placeholder="novo e-mail (opcional)"
                          value={novoEmail}
                          onChange={(e) => setNovoEmail(e.target.value)}
                        />
                        <input
                          type="text"
                          placeholder="nova senha (opcional, min. 8 caracteres)"
                          value={novaSenha}
                          onChange={(e) => setNovaSenha(e.target.value)}
                        />
                        {mensagemEdicao && <p className="texto-secundario" style={{ fontSize: "0.8rem" }}>{mensagemEdicao}</p>}
                        <div style={{ display: "flex", gap: "0.4rem" }}>
                          <button
                            type="button"
                            className="btn"
                            disabled={novaSenha.length > 0 && novaSenha.length < 8}
                            onClick={() => confirmarEdicao(cliente)}
                          >
                            Salvar
                          </button>
                          <button type="button" className="btn btn-secundario" onClick={() => setEditandoId(null)}>
                            Fechar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" className="btn btn-secundario" onClick={() => abrirEdicao(cliente)}>
                        Editar login
                      </button>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-perigo"
                      disabled={excluindoId === cliente.id}
                      onClick={() => excluirConta(cliente)}
                    >
                      {excluindoId === cliente.id ? "Excluindo..." : "Excluir"}
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
