import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../api/client.js";
import {
  criarUsuario,
  editarUsuario,
  excluirUsuario,
  listarUnidades,
  listarUsuarios,
  type DadosNovoUsuario,
} from "../api/resources.js";
import { useAuth } from "../context/AuthContext.js";
import { PERMISSOES_DISPONIVEIS, type PapelUsuario, type Permissao, type Unidade, type UsuarioComAcesso } from "../types.js";

const PAPEL_LABEL: Record<PapelUsuario, string> = {
  owner: "Owner (acesso total)",
  gerente: "Gerente",
  funcionario: "Funcionario",
};

type PapelCriavel = DadosNovoUsuario["papel"];

export function UsersPage() {
  const [usuarios, setUsuarios] = useState<UsuarioComAcesso[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [username, setUsername] = useState("");
  const [senha, setSenha] = useState("");
  const [papel, setPapel] = useState<PapelCriavel>("funcionario");
  const [unidadeIds, setUnidadeIds] = useState<string[]>([]);
  const [permissoes, setPermissoes] = useState<Permissao[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  const { usuario: usuarioLogado } = useAuth();
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [edNome, setEdNome] = useState("");
  const [edSenha, setEdSenha] = useState("");
  const [edUnidadeIds, setEdUnidadeIds] = useState<string[]>([]);
  const [edPermissoes, setEdPermissoes] = useState<Permissao[]>([]);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [erroEdicao, setErroEdicao] = useState<string | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const [listaUsuarios, listaUnidades] = await Promise.all([listarUsuarios(), listarUnidades()]);
      setUsuarios(listaUsuarios);
      setUnidades(listaUnidades);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel carregar os usuarios.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  function alternarUnidade(id: string) {
    setUnidadeIds((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  }

  function alternarPermissao(valor: Permissao) {
    setPermissoes((atual) => (atual.includes(valor) ? atual.filter((x) => x !== valor) : [...atual, valor]));
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErroForm(null);
    if (unidadeIds.length === 0) {
      setErroForm("Selecione pelo menos uma unidade.");
      return;
    }
    setSalvando(true);
    try {
      await criarUsuario({ nome, username, senha, papel, unidadeIds, permissoes });
      setNome("");
      setUsername("");
      setSenha("");
      setPapel("funcionario");
      setUnidadeIds([]);
      setPermissoes([]);
      await carregar();
    } catch (err) {
      setErroForm(err instanceof ApiError ? err.message : "Nao foi possivel criar o usuario.");
    } finally {
      setSalvando(false);
    }
  }

  function abrirEdicao(u: UsuarioComAcesso) {
    setEditandoId(u.id);
    setEdNome(u.nome);
    setEdSenha("");
    setEdUnidadeIds(u.unidades.map((un) => un.id));
    setEdPermissoes(u.permissoes);
    setErroEdicao(null);
  }

  function alternarUnidadeEdicao(id: string) {
    setEdUnidadeIds((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  }

  function alternarPermissaoEdicao(valor: Permissao) {
    setEdPermissoes((atual) => (atual.includes(valor) ? atual.filter((x) => x !== valor) : [...atual, valor]));
  }

  async function salvarEdicao(u: UsuarioComAcesso) {
    setErroEdicao(null);
    if (edUnidadeIds.length === 0) {
      setErroEdicao("Selecione pelo menos uma unidade.");
      return;
    }
    setSalvandoEdicao(true);
    try {
      await editarUsuario(u.id, {
        ...(edNome.trim() && edNome.trim() !== u.nome && { nome: edNome.trim() }),
        ...(edSenha && { senha: edSenha }),
        unidadeIds: edUnidadeIds,
        permissoes: edPermissoes,
      });
      setEditandoId(null);
      await carregar();
    } catch (err) {
      setErroEdicao(err instanceof ApiError ? err.message : "Nao foi possivel salvar as alteracoes.");
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function excluir(u: UsuarioComAcesso) {
    if (!window.confirm(`Excluir o login "${u.nome}"? Essa acao nao pode ser desfeita.`)) return;
    setExcluindoId(u.id);
    setErro(null);
    try {
      await excluirUsuario(u.id);
      setUsuarios((lista) => lista.filter((x) => x.id !== u.id));
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel excluir o usuario.");
    } finally {
      setExcluindoId(null);
    }
  }

  return (
    <div>
      {erro && <p className="erro">{erro}</p>}

      <div className="cartao">
        <h3 style={{ marginTop: 0 }}>Novo login</h3>
        <p className="texto-secundario" style={{ marginTop: 0, fontSize: "0.85rem" }}>
          Gerente/funcionario logam so com usuario e senha (sem e-mail) - defina aqui as lojas e funcionalidades que
          esse acesso tera. Compartilhe a senha com a pessoa por um canal seguro.
        </p>
        <form onSubmit={salvar}>
          <div className="linha-form">
            <label>
              Nome
              <input value={nome} onChange={(e) => setNome(e.target.value)} required />
            </label>
            <label>
              Nome de usuario
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                placeholder="joao.silva"
                required
              />
            </label>
            <label>
              Senha
              <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} minLength={8} required />
            </label>
            <label>
              Papel
              <select value={papel} onChange={(e) => setPapel(e.target.value as PapelCriavel)}>
                <option value="funcionario">Funcionario</option>
                <option value="gerente">Gerente</option>
              </select>
            </label>
          </div>

          <div style={{ marginTop: "0.75rem" }}>
            <span style={{ display: "block", marginBottom: "0.35rem", fontSize: "0.85rem" }}>
              Lojas com acesso (um gerente geral pode ter varias)
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
              {unidades.map((u) => (
                <label key={u.id} style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontWeight: 400 }}>
                  <input type="checkbox" checked={unidadeIds.includes(u.id)} onChange={() => alternarUnidade(u.id)} />
                  {u.nome}
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginTop: "0.75rem" }}>
            <span style={{ display: "block", marginBottom: "0.35rem", fontSize: "0.85rem" }}>
              Funcionalidades liberadas (reservas do dia ja sao sempre liberadas)
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
              {PERMISSOES_DISPONIVEIS.map((p) => (
                <label key={p.valor} style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={permissoes.includes(p.valor)}
                    onChange={() => alternarPermissao(p.valor)}
                  />
                  {p.rotulo}
                </label>
              ))}
            </div>
          </div>

          {erroForm && <p className="erro">{erroForm}</p>}
          <button className="btn" type="submit" disabled={salvando} style={{ marginTop: "0.75rem" }}>
            {salvando ? "Salvando..." : "Criar login"}
          </button>
        </form>
      </div>

      <div className="cartao">
        <h3 style={{ marginTop: 0 }}>Logins da empresa</h3>
        {carregando ? (
          <p>Carregando...</p>
        ) : (
          <div className="tabela-scroll">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Login</th>
                <th>Papel</th>
                <th>Lojas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  {editandoId === u.id ? (
                    <td colSpan={5}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", padding: "0.5rem 0" }}>
                        <div className="linha-form">
                          <label>
                            Nome
                            <input value={edNome} onChange={(e) => setEdNome(e.target.value)} />
                          </label>
                          <label>
                            Nova senha (opcional, min. 8 caracteres)
                            <input type="password" value={edSenha} onChange={(e) => setEdSenha(e.target.value)} />
                          </label>
                        </div>
                        <div>
                          <span style={{ display: "block", marginBottom: "0.35rem", fontSize: "0.85rem" }}>Lojas com acesso</span>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
                            {unidades.map((un) => (
                              <label key={un.id} style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontWeight: 400 }}>
                                <input type="checkbox" checked={edUnidadeIds.includes(un.id)} onChange={() => alternarUnidadeEdicao(un.id)} />
                                {un.nome}
                              </label>
                            ))}
                          </div>
                        </div>
                        <div>
                          <span style={{ display: "block", marginBottom: "0.35rem", fontSize: "0.85rem" }}>Funcionalidades liberadas</span>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
                            {PERMISSOES_DISPONIVEIS.map((p) => (
                              <label key={p.valor} style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontWeight: 400 }}>
                                <input type="checkbox" checked={edPermissoes.includes(p.valor)} onChange={() => alternarPermissaoEdicao(p.valor)} />
                                {p.rotulo}
                              </label>
                            ))}
                          </div>
                        </div>
                        {erroEdicao && <p className="erro">{erroEdicao}</p>}
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button type="button" className="btn" disabled={salvandoEdicao} onClick={() => salvarEdicao(u)}>
                            {salvandoEdicao ? "Salvando..." : "Salvar"}
                          </button>
                          <button type="button" className="btn btn-secundario" onClick={() => setEditandoId(null)}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </td>
                  ) : (
                    <>
                      <td>{u.nome}</td>
                      <td>{u.email ?? u.username}</td>
                      <td>{PAPEL_LABEL[u.papel]}</td>
                      <td>{u.papel === "owner" ? "Todas" : u.unidades.map((un) => un.nome).join(", ") || "-"}</td>
                      <td>
                        {u.papel !== "owner" && (
                          <div style={{ display: "flex", gap: "0.4rem" }}>
                            <button type="button" className="btn btn-secundario" onClick={() => abrirEdicao(u)}>
                              Editar
                            </button>
                            <button
                              type="button"
                              className="btn btn-perigo"
                              disabled={excluindoId === u.id || u.id === usuarioLogado?.id}
                              title={u.id === usuarioLogado?.id ? "Voce nao pode excluir o proprio usuario" : undefined}
                              onClick={() => excluir(u)}
                            >
                              {excluindoId === u.id ? "Excluindo..." : "Excluir"}
                            </button>
                          </div>
                        )}
                      </td>
                    </>
                  )}
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
