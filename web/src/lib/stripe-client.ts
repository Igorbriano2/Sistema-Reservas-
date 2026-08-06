import { loadStripe } from "@stripe/stripe-js";

// loadStripe deve ser chamado uma unica vez fora de qualquer componente (recomendacao
// da propria Stripe) - a chave publicavel nunca e secreta, e por isso pode ficar num
// build-time env var do Vite (ver .env.example).
const chavePublicavel = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

export const stripePromise = chavePublicavel ? loadStripe(chavePublicavel) : null;
