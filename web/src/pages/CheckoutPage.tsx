import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { verificarEmailDisponivel } from "../api/resources.js";
import { formatarCpfCnpj, validarCpfOuCnpj } from "../lib/documento.js";
import { Marca } from "../components/Marca.js";

const ETAPAS = ["Dados", "Pagamento", "Senha", "Pronto"];

export interface DadosCadastrais {
  nome: string;
  telefone: string;
  email: string;
  documento: string;
  nomeEmpresa: string;
}

const DADOS_VAZIOS: DadosCadastrais = { nome: "", telefone: "", email: "", documento: "", nomeEmpresa: "" };

function Stepper({ etapaAtual }: { etapaAtual: number }) {
  return (
    <div className="checkout-stepper">
      {ETAPAS.map((nome, indice) => (
        <div key={nome} className={`checkout-step ${indice + 1 <= etapaAtual ? "ativo" : ""}`}>
          <span className="checkout-step-numero">{indice + 1}</span>
          <span className="checkout-step-nome">{nome}</span>
        </div>
      ))}
    </div>
  );
}

export function CheckoutPage() {
  const [etapa, setEtapa] = useState(1);
  const [dados, setDados] = useState<DadosCadastrais>(DADOS_VAZIOS);
  const [documentoVisivel, setDocumentoVisivel] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function avancar(e: FormEvent) {
    e.preventDefault();
    setErro(null);

    if (!validarCpfOuCnpj(dados.documento)) {
      setErro("CPF ou CNPJ invalido. Confira os numeros digitados.");
      return;
    }
    if (dados.telefone.replace(/\D/g, "").length < 10) {
      setErro("Telefone invalido. Informe DDD + numero.");
      return;
    }

    setEnviando(true);
    try {
      const { disponivel } = await verificarEmailDisponivel(dados.email);
      if (!disponivel) {
        setErro("Ja existe uma conta com este e-mail. Faça login ou use outro e-mail.");
        return;
      }
      setEtapa(2);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel validar seus dados agora. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="tela-login">
      <div className="form-login checkout-card">
        <Marca tamanho="grande" />
        <Stepper etapaAtual={etapa} />

        {etapa === 1 && (
          <form onSubmit={avancar} className="checkout-form">
            <h1 style={{ margin: 0, fontSize: "1.1rem" }}>Vamos comecar sua assinatura</h1>
            <p className="texto-secundario" style={{ fontSize: "0.85rem", marginTop: 0 }}>
              7 dias grátis, depois R$ 697/mes. Cancele quando quiser durante o teste, sem cobranca.
            </p>
            <label>
              Seu nome completo
              <input value={dados.nome} onChange={(e) => setDados({ ...dados, nome: e.target.value })} required />
            </label>
            <label>
              Telefone (com DDD)
              <input
                value={dados.telefone}
                onChange={(e) => setDados({ ...dados, telefone: e.target.value })}
                placeholder="(11) 91234-5678"
                required
              />
            </label>
            <label>
              E-mail
              <input
                type="email"
                value={dados.email}
                onChange={(e) => setDados({ ...dados, email: e.target.value })}
                required
              />
            </label>
            <label>
              CPF ou CNPJ
              <input
                value={documentoVisivel}
                onChange={(e) => {
                  const formatado = formatarCpfCnpj(e.target.value);
                  setDocumentoVisivel(formatado);
                  setDados({ ...dados, documento: formatado });
                }}
                placeholder="000.000.000-00"
                required
              />
            </label>
            <label>
              Nome do restaurante
              <input
                value={dados.nomeEmpresa}
                onChange={(e) => setDados({ ...dados, nomeEmpresa: e.target.value })}
                required
              />
            </label>
            {erro && <span className="erro">{erro}</span>}
            <button className="btn" type="submit" disabled={enviando}>
              {enviando ? "Validando..." : "Continuar"}
            </button>
            <Link to="/" className="texto-secundario" style={{ fontSize: "0.8rem", textAlign: "center" }}>
              Voltar
            </Link>
          </form>
        )}

        {etapa === 2 && (
          <div className="checkout-form">
            <h1 style={{ margin: 0, fontSize: "1.1rem" }}>Dados confirmados!</h1>
            <p className="texto-secundario" style={{ fontSize: "0.9rem" }}>
              Prazer, {dados.nome.split(" ")[0]}. A etapa de pagamento (cartao + inicio do teste gratis de 7 dias)
              esta em construcao e chega em breve.
            </p>
            <button className="btn btn-secundario" type="button" onClick={() => setEtapa(1)}>
              Voltar e revisar dados
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
