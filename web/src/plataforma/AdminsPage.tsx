import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../api/client.js";
import { usePlataformaAuth } from "./PlataformaAuthContext.js";
import { criarAdmin, excluirAdmin, listarAdmins } from "./resources.js";
import type { PlataformaAdminConta } from "./types.js";

export function AdminsPage() {
  const { admin: adminLogado } = usePlataformaAuth();
  const [admins, setAdmins] = useState<PlataformaAdminConta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      setAdmins(await listarAdmins());
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel carregar os admins.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErroForm(null);
    setSalvando(true);
    try {
      await criarAdmin({ nome, email, senha });
      setNome("");
      setEmail("");
      setSenha("");
      await carregar();
    } catch (err) {
      setErroForm(err instanceof ApiError ? err.message : "Nao foi possivel criar o admin.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(a: PlataformaAdminConta) {
    if (!window.confirm(`Excluir o acesso de "${a.nome}" ao painel da plataforma? Essa acao nao pode ser desfeita.`)) return;
    setExcluindoId(a.id);
    setErro(null);
    try {
      await excluirAdmin(a.id);
      setAdmins((lista) => lista.filter((x) => x.id !== a.id));
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel excluir o admin.");
    } finally {
      setExcluindoId(null);
    }
  }

  return (
    <div>
      {erro && <p className="erro">{erro}</p>}

      <div className="cartao">
        <h3 style={{ marginTop: 0 }}>Novo admin da plataforma</h3>
        <p className="texto-secundario" style={{ marginTop: 0, fontSize: "0.85rem" }}>
          Todo admin tem o mesmo nivel de acesso (dono da plataforma) - sem hierarquia entre eles. Compartilhe a senha
          por um canal seguro.
        </p>
        <form onSubmit={salvar}>
          <div className="linha-form">
            <label>
              Nome
              <input value={nome} onChange={(e) => setNome(e.target.value)} required />
            </label>
            <label>
              E-mail
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              Senha
              <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} minLength={8} required />
            </label>
          </div>
          {erroForm && <p className="erro">{erroForm}</p>}
          <button className="btn" type="submit" disabled={salvando} style={{ marginTop: "0.75rem" }}>
            {salvando ? "Salvando..." : "Criar admin"}
          </button>
        </form>
      </div>

      <div className="cartao">
        <h3 style={{ marginTop: 0 }}>Admins da plataforma</h3>
        {carregando ? (
          <p>Carregando...</p>
        ) : (
          <div className="tabela-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Desde</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.id}>
                    <td>{a.nome}</td>
                    <td>{a.email}</td>
                    <td>{a.criadoEm.slice(0, 10).split("-").reverse().join("/")}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-perigo"
                        disabled={excluindoId === a.id || a.id === adminLogado?.id || admins.length <= 1}
                        title={
                          a.id === adminLogado?.id
                            ? "Voce nao pode excluir o proprio login"
                            : admins.length <= 1
                              ? "Nao e possivel excluir o ultimo admin"
                              : undefined
                        }
                        onClick={() => excluir(a)}
                      >
                        {excluindoId === a.id ? "Excluindo..." : "Excluir"}
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
