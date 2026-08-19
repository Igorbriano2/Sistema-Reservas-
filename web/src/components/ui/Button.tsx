import type { ButtonHTMLAttributes } from "react";

export type ButtonVariante = "primario" | "secundario" | "perigo";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: ButtonVariante;
  // .btn-icone (index.css) - botao so com icone, sem texto (precisa de aria-label).
  somenteIcone?: boolean;
}

const CLASSE_POR_VARIANTE: Record<ButtonVariante, string> = {
  primario: "btn",
  secundario: "btn btn-secundario",
  perigo: "btn btn-perigo",
};

// Wrapper fino sobre as classes .btn/.btn-secundario/.btn-perigo/.btn-icone que ja
// existem em index.css (doc redesign D3) - nao muda nenhum estilo, so evita repetir
// (e arriscar esquecer) a combinacao certa de classes em cada tela nova. Paginas
// existentes continuam funcionando com <button className="btn ..."> direto; nao ha
// obrigacao de migrar tudo de uma vez.
export function Button({ variante = "primario", somenteIcone, className, type = "button", ...props }: ButtonProps) {
  const classes = [CLASSE_POR_VARIANTE[variante], somenteIcone ? "btn-icone" : "", className].filter(Boolean).join(" ");
  return <button type={type} className={classes} {...props} />;
}
