import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { usePlataformaAuth } from "./PlataformaAuthContext.js";
import { ApiError } from "../api/client.js";
import { Marca } from "../components/Marca.js";

export function PlataformaLoginPage() {
  const { admin, login } = usePlataformaAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (admin) {
    return <Navigate to="/painel/clientes" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await login(email, senha);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel entrar. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="tela-login">
      <form className="form-login" onSubmit={handleSubmit}>
        <Marca tamanho="grande" />
        <h1 style={{ margin: 0, fontSize: "1.25rem" }}>Painel da plataforma</h1>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label>
          Senha
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </label>
        {erro && <span className="erro">{erro}</span>}
        <button className="btn" type="submit" disabled={enviando}>
          {enviando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
