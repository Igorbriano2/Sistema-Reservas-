import { useState, type FormEvent } from "react";
import { CardElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { ApiError } from "../../api/client.js";
import { criarAssinatura, type AssinaturaCriada } from "../../api/resources.js";
import type { DadosCadastrais } from "../../pages/CheckoutPage.js";

// Stripe Elements roda num iframe isolado e nao le CSS vars, entao as cores
// (tema escuro, o unico que este fluxo publico usa) ficam fixas aqui em vez de
// var(--text-primary)/var(--status-cancelada).
const ESTILO_CARTAO = {
  style: {
    base: {
      color: "#f5efe8",
      fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: "15px",
      "::placeholder": { color: "rgba(245, 239, 232, 0.4)" },
    },
    invalid: { color: "#9c6b5c" },
  },
};

interface EtapaPagamentoProps {
  dados: DadosCadastrais;
  onSucesso: (resultado: AssinaturaCriada) => void;
  onVoltar: () => void;
}

export function EtapaPagamento({ dados, onSucesso, onVoltar }: EtapaPagamentoProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [cartaoFocado, setCartaoFocado] = useState(false);

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) return;

    setEnviando(true);
    setErro(null);
    try {
      const { error: erroCartao, paymentMethod } = await stripe.createPaymentMethod({
        type: "card",
        card: cardElement,
        billing_details: { name: dados.nome, email: dados.email, phone: dados.telefone },
      });

      if (erroCartao || !paymentMethod) {
        setErro(erroCartao?.message ?? "Nao foi possivel validar o cartao. Confira os dados e tente novamente.");
        return;
      }

      const resultado = await criarAssinatura({ ...dados, paymentMethodId: paymentMethod.id });
      onSucesso(resultado);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel processar o pagamento agora. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={confirmar} className="checkout-form">
      <h1 style={{ margin: 0, fontSize: "1.1rem" }}>Dados do cartão</h1>
      <p className="texto-secundario" style={{ fontSize: "0.85rem", marginTop: 0 }}>
        7 dias grátis. Seu cartão só é cobrado depois do período de teste, e você pode cancelar antes sem pagar nada.
      </p>
      <label>
        Cartão de crédito
        <div className={`checkout-card-element ${cartaoFocado ? "focado" : ""}`}>
          <CardElement
            options={ESTILO_CARTAO}
            onFocus={() => setCartaoFocado(true)}
            onBlur={() => setCartaoFocado(false)}
          />
        </div>
      </label>
      {erro && <span className="erro">{erro}</span>}
      <button className="btn" type="submit" disabled={enviando || !stripe}>
        {enviando ? "Processando..." : "Confirmar e começar teste grátis"}
      </button>
      <button className="btn btn-secundario" type="button" onClick={onVoltar} disabled={enviando}>
        Voltar e revisar dados
      </button>
    </form>
  );
}
