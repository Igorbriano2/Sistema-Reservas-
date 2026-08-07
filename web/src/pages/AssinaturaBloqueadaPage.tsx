import { useAuth } from "../context/AuthContext.js";
import { Marca } from "../components/Marca.js";

const MENSAGEM_POR_MOTIVO: Record<string, string> = {
  cancelada: "Sua assinatura foi cancelada. Para voltar a usar o painel, assine novamente ou fale com o suporte.",
  atrasada: "O pagamento da sua assinatura está atrasado há mais tempo do que o período de tolerância. Regularize para continuar.",
  manual: "Sua conta está temporariamente inativa. Entre em contato com o suporte para mais informações.",
};

export function AssinaturaBloqueadaPage() {
  const { assinaturaBloqueada, logout } = useAuth();
  const mensagem = assinaturaBloqueada?.motivo
    ? (MENSAGEM_POR_MOTIVO[assinaturaBloqueada.motivo] ?? assinaturaBloqueada.mensagem)
    : (assinaturaBloqueada?.mensagem ?? "Sua conta está inativa no momento.");

  return (
    <div className="tela-login">
      <div className="form-login">
        <Marca tamanho="grande" />
        <h1 style={{ margin: 0, fontSize: "1.1rem" }}>Painel indisponível</h1>
        <p className="texto-secundario" style={{ fontSize: "0.9rem" }}>{mensagem}</p>
        <button className="btn btn-secundario" type="button" onClick={logout}>
          Sair
        </button>
      </div>
    </div>
  );
}
