import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../api/client.js";
import { criarUsuario, listarUsuarios } from "../api/resources.js";
import type { PapelUsuario, Usuario } from "../types.js";

const PAPEL_LABEL: Record<PapelUsuario, string> = {
  owner: "Owner (acesso total)",
  funcionario: "Funcionario (so reservas do dia)",
};

export function UsersPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [papel, setPapel] = useState<PapelUsuario>("funcionario");
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      setUsuarios(await listarUsuarios());
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel carregar os usuarios.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErroForm(null);
    try {
      await criarUsuario({ nome, email, senha, papel });
      setNome("");
      setEmail("");
      setSenha("");
      setPapel("funcionario");
      await carregar();
    } catch (err) {
      setErroForm(err instanceof ApiError ? err.message : "Nao foi possivel criar o usuario.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      {erro && <p className="erro">{erro}</p>}

      <div className="cartao">
        <h3 style={{ marginTop: 0 }}>Novo login</h3>
        <p style={{ marginTop: 0, color: "#666", fontSize: "0.85rem" }}>
          Cadastre o login direto aqui - sem convite por email por enquanto. Compartilhe a senha com a pessoa por um
          canal seguro.
        </p>
        <form onSubmit={salvar}>
          <div className="linha-form">
            <label>
              Nome
              <input value={nome} onChange={(e) => setNome(e.target.value)} required />
            </label>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              Senha
              <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} minLength={8} required />
            </label>
            <label>
              Papel
              <select value={papel} onChange={(e) => setPapel(e.target.value as PapelUsuario)}>
                <option value="funcionario">Funcionario</option>
                <option value="owner">Owner</option>
              </select>
            </label>
          </div>
          {erroForm && <p className="erro">{erroForm}</p>}
          <button className="btn" type="submit" disabled={salvando}>
            {salvando ? "Salvando..." : "Criar login"}
          </button>
        </form>
      </div>

      <div className="cartao">
        <h3 style={{ marginTop: 0 }}>Logins da empresa</h3>
        {carregando ? (
          <p>Carregando...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Papel</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td>{u.nome}</td>
                  <td>{u.email}</td>
                  <td>{PAPEL_LABEL[u.papel]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
