import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { obterCardapioPublico, type CardapioPublico } from "../api/resources.js";
import { Marca } from "../components/Marca.js";

type Estado = "carregando" | "invalido" | "pronto";

function formatarPreco(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function PublicMenuPage() {
  const { unidadeId } = useParams<{ unidadeId: string }>();
  const [estado, setEstado] = useState<Estado>("carregando");
  const [cardapio, setCardapio] = useState<CardapioPublico | null>(null);

  useEffect(() => {
    if (!unidadeId) {
      setEstado("invalido");
      return;
    }
    obterCardapioPublico(unidadeId)
      .then((dados) => {
        setCardapio(dados);
        setEstado("pronto");
      })
      .catch(() => setEstado("invalido"));
  }, [unidadeId]);

  if (estado === "carregando") {
    return (
      <div className="tela-login">
        <p>Carregando cardápio...</p>
      </div>
    );
  }

  if (estado === "invalido" || !cardapio) {
    return (
      <div className="tela-login">
        <div className="form-login">
          <Marca tamanho="grande" />
          <h1 style={{ margin: 0, fontSize: "1.1rem" }}>Cardápio não encontrado</h1>
          <p className="texto-secundario" style={{ fontSize: "0.9rem" }}>
            Não encontramos o cardápio deste restaurante. Confira o QR code ou peça o link novamente.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pagina-cardapio">
      <div className="pagina-cardapio-cabecalho">
        <Marca tamanho="grande" />
        <h1>{cardapio.unidadeNome}</h1>
      </div>

      {cardapio.categorias.length === 0 ? (
        <p className="texto-secundario" style={{ textAlign: "center" }}>
          O cardápio ainda não foi publicado.
        </p>
      ) : (
        cardapio.categorias.map((categoria) => (
          <section className="cardapio-categoria" key={categoria.id}>
            <h2>{categoria.nome}</h2>
            {categoria.itens.map((item) => (
              <div className="cardapio-item" key={item.id}>
                {item.imagemUrl && <img className="cardapio-item-imagem" src={item.imagemUrl} alt={item.nome} />}
                <div className="cardapio-item-info">
                  <div className="cardapio-item-topo">
                    <strong>{item.nome}</strong>
                    <span className="cardapio-item-preco">{formatarPreco(item.precoCentavos)}</span>
                  </div>
                  {item.descricao && <p className="cardapio-item-descricao">{item.descricao}</p>}
                  {(item.porcaoServePessoas != null || item.somenteMaiorIdade || (item.tags && item.tags.length > 0)) && (
                    <div className="cardapio-item-tags">
                      {item.porcaoServePessoas != null && <span className="cardapio-item-tag">Serve até {item.porcaoServePessoas}</span>}
                      {item.somenteMaiorIdade && <span className="cardapio-item-tag">+18</span>}
                      {item.tags?.map((tag) => (
                        <span className="cardapio-item-tag" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
