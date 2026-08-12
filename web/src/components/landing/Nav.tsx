import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Marca } from "../Marca.js";

const LINKS = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#recursos", label: "Recursos" },
  { href: "#comparativo", label: "Comparativo" },
  { href: "#preco", label: "Preço" },
];

// Nav fixa em pilula, flutuando sobre o hero (doc 38) - /assinar e /login sao rotas
// internas desta mesma SPA (Link do react-router), nunca um href absoluto pro
// dominio de producao.
export function Nav() {
  const [rolado, setRolado] = useState(false);

  useEffect(() => {
    function aoRolar() {
      setRolado(window.scrollY > 40);
    }
    aoRolar();
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, []);

  return (
    <header className="lp-nav">
      <div className={`lp-nav-pilula lp-moldura ${rolado ? "rolada" : ""}`}>
        <a href="#top" style={{ display: "flex", flexShrink: 0, textDecoration: "none" }}>
          <Marca />
        </a>

        <nav className="lp-nav-links">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>

        <Link to="/login" className="lp-link-entrar" style={{ flexShrink: 0, marginRight: "0.25rem" }}>
          Entrar
        </Link>
        <Link to="/assinar" className="lp-btn-pilula lp-btn-pilula-compacto" style={{ flexShrink: 0 }}>
          Assinar
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </header>
  );
}

// Barra fixa no rodape, so no mobile, aparecendo depois de rolar (doc 38).
export function BarraFixaMobile() {
  const [mostrar, setMostrar] = useState(false);

  useEffect(() => {
    function aoRolar() {
      setMostrar(window.scrollY > 700);
    }
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, []);

  return (
    <div className={`lp-barra-fixa-mobile ${mostrar ? "visivel" : ""}`}>
      <div className="lp-barra-fixa-mobile-linha">
        <div className="lp-barra-fixa-mobile-preco">
          <strong>R$ 697/mês</strong>
          <span>7 dias grátis</span>
        </div>
        <Link to="/assinar" className="lp-btn-pilula lp-btn-pilula-compacto">
          Começar agora →
        </Link>
      </div>
    </div>
  );
}
