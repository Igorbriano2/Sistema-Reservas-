import type { ReactNode } from "react";

export interface FormFieldProps {
  rotulo: ReactNode;
  // Texto de apoio opcional (ex: formato esperado) - some quando ha erro, pra nao
  // competir por atencao com a mensagem que importa agora.
  dica?: string;
  erro?: string | null;
  children: ReactNode;
}

// Wrapper fino sobre o padrao <label>texto + input</label> que ja existia em toda
// pagina com formulario (LoginPage, CheckoutPage, etc. - doc redesign D3): mesma
// estrutura HTML/CSS (label com display:flex column em index.css), so formaliza
// dica/erro por campo em vez de cada pagina inventar o proprio jeito de mostrar erro.
export function FormField({ rotulo, dica, erro, children }: FormFieldProps) {
  return (
    <label>
      {rotulo}
      {children}
      {erro ? (
        <span className="erro">{erro}</span>
      ) : (
        dica && (
          <span className="texto-secundario" style={{ fontWeight: 400, fontSize: "0.78rem" }}>
            {dica}
          </span>
        )
      )}
    </label>
  );
}
