import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../../api/client.js";
import { criarConta, type AssinaturaCriada } from "../../api/resources.js";
import { useAuth } from "../../context/AuthContext.js";
import type { DadosCadastrais } from "../../pages/CheckoutPage.js";

interface EtapaSenhaProps {
  dados: DadosCadastrais;
  assinatura: AssinaturaCriada;
  onVoltar: () => void;
}

// Etapa 3 (senha) + Etapa 4 (login automatico) num unico componente: ao concluir,
// cria a conta e ja loga com o e-mail/senha desta etapa, redirecionando pro painel -
// sem precisar de uma tela separada so pra "Pronto".
export function EtapaSenha({ dados, assinatura, onVoltar }: EtapaSenhaProps) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function concluir(e: FormEvent) {
    e.preventDefault();
    setErro(null);

    if (senha.length < 8) {
      setErro("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (senha !== confirmarSenha) {
      setErro("As senhas não são iguais.");
      return;
    }

    setEnviando(true);
    try {
      await criarConta({
        ...dados,
        senha,
        stripeCustomerId: assinatura.stripeCustomerId,
        stripeSubscriptionId: assinatura.stripeSubscriptionId,
      });
      await login(dados.email, senha);
      navigate("/admin");
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível concluir o cadastro agora. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={concluir} className="checkout-form">
      <h1 style={{ margin: 0, fontSize: "1.1rem" }}>Crie sua senha</h1>
      <p className="texto-secundario" style={{ fontSize: "0.85rem", marginTop: 0 }}>
        Seu teste grátis de 7 dias já começou. Essa senha, junto com o e-mail {dados.email} ou o usuário {dados.username},
        é o seu login no painel.
      </p>
      <label>
        Senha
        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={8} />
      </label>
      <label>
        Confirmar senha
        <input
          type="password"
          value={confirmarSenha}
          onChange={(e) => setConfirmarSenha(e.target.value)}
          required
          minLength={8}
        />
      </label>
      {erro && <span className="erro">{erro}</span>}
      <button className="btn" type="submit" disabled={enviando}>
        {enviando ? "Entrando..." : "Concluir e entrar no painel"}
      </button>
      <button className="btn btn-secundario" type="button" onClick={onVoltar} disabled={enviando}>
        Voltar
      </button>
    </form>
  );
}
