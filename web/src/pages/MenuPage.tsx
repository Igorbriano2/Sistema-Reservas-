import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.js";
import { ApiError } from "../api/client.js";
import {
  atualizarCategoriaCardapio,
  atualizarItemCardapio,
  criarCategoriaCardapio,
  criarItemCardapio,
  enviarImagemItemCardapio,
  excluirCategoriaCardapio,
  excluirItemCardapio,
  listarCardapio,
} from "../api/resources.js";
import type { CardapioCategoria, CardapioItem } from "../types.js";

function formatarPreco(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface FormItemState {
  nome: string;
  descricao: string;
  preco: string;
  imagemUrl: string;
  porcaoServePessoas: string;
  somenteMaiorIdade: boolean;
  tags: string;
}

const FORM_ITEM_VAZIO: FormItemState = {
  nome: "",
  descricao: "",
  preco: "",
  imagemUrl: "",
  porcaoServePessoas: "",
  somenteMaiorIdade: false,
  tags: "",
};

function itemParaForm(item: CardapioItem): FormItemState {
  return {
    nome: item.nome,
    descricao: item.descricao ?? "",
    preco: (item.precoCentavos / 100).toFixed(2),
    imagemUrl: item.imagemUrl ?? "",
    porcaoServePessoas: item.porcaoServePessoas != null ? String(item.porcaoServePessoas) : "",
    somenteMaiorIdade: item.somenteMaiorIdade,
    tags: (item.tags ?? []).join(", "),
  };
}

function formParaDados(form: FormItemState, categoriaId: string) {
  return {
    categoriaId,
    nome: form.nome.trim(),
    descricao: form.descricao.trim() || undefined,
    precoCentavos: Math.round(Number(form.preco.replace(",", ".")) * 100),
    imagemUrl: form.imagemUrl.trim() || undefined,
    porcaoServePessoas: form.porcaoServePessoas ? Number(form.porcaoServePessoas) : undefined,
    somenteMaiorIdade: form.somenteMaiorIdade,
    tags: form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

export function MenuPage() {
  const { unidade } = useAuth();
  const [categorias, setCategorias] = useState<CardapioCategoria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [linkCopiado, setLinkCopiado] = useState(false);

  const [nomeNovaCategoria, setNomeNovaCategoria] = useState("");
  const [salvandoCategoria, setSalvandoCategoria] = useState(false);

  const [editandoCategoriaId, setEditandoCategoriaId] = useState<string | null>(null);
  const [nomeEdicaoCategoria, setNomeEdicaoCategoria] = useState("");

  const [categoriaFormAberto, setCategoriaFormAberto] = useState<string | null>(null);
  const [formItem, setFormItem] = useState<FormItemState>(FORM_ITEM_VAZIO);
  const [salvandoItem, setSalvandoItem] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  const [editandoItemId, setEditandoItemId] = useState<string | null>(null);
  const [formEdicaoItem, setFormEdicaoItem] = useState<FormItemState>(FORM_ITEM_VAZIO);

  const [enviandoImagemItemId, setEnviandoImagemItemId] = useState<string | null>(null);
  const [erroImagem, setErroImagem] = useState<string | null>(null);

  async function carregar() {
    if (!unidade) return;
    setCarregando(true);
    setErro(null);
    try {
      const lista = await listarCardapio(unidade.id);
      setCategorias(lista);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel carregar o cardápio.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidade?.id]);

  async function salvarCategoria(e: React.FormEvent) {
    e.preventDefault();
    if (!unidade || !nomeNovaCategoria.trim()) return;
    setSalvandoCategoria(true);
    try {
      await criarCategoriaCardapio(unidade.id, { nome: nomeNovaCategoria.trim() });
      setNomeNovaCategoria("");
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel criar a categoria.");
    } finally {
      setSalvandoCategoria(false);
    }
  }

  function abrirEdicaoCategoria(categoria: CardapioCategoria) {
    setEditandoCategoriaId(categoria.id);
    setNomeEdicaoCategoria(categoria.nome);
  }

  async function salvarEdicaoCategoria(e: React.FormEvent) {
    e.preventDefault();
    if (!unidade || !editandoCategoriaId || !nomeEdicaoCategoria.trim()) return;
    try {
      await atualizarCategoriaCardapio(unidade.id, editandoCategoriaId, { nome: nomeEdicaoCategoria.trim() });
      setEditandoCategoriaId(null);
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel atualizar a categoria.");
    }
  }

  async function alternarAtivoCategoria(categoria: CardapioCategoria) {
    if (!unidade) return;
    try {
      await atualizarCategoriaCardapio(unidade.id, categoria.id, { ativo: !categoria.ativo });
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel atualizar a categoria.");
    }
  }

  async function excluirCategoria(categoria: CardapioCategoria) {
    if (!unidade) return;
    if (!confirm(`Excluir a categoria "${categoria.nome}" e todos os itens dela?`)) return;
    try {
      await excluirCategoriaCardapio(unidade.id, categoria.id);
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel excluir a categoria.");
    }
  }

  function abrirFormItem(categoriaId: string) {
    setCategoriaFormAberto(categoriaId === categoriaFormAberto ? null : categoriaId);
    setFormItem(FORM_ITEM_VAZIO);
    setErroForm(null);
  }

  async function salvarItem(e: React.FormEvent, categoriaId: string) {
    e.preventDefault();
    if (!unidade || !formItem.nome.trim() || !formItem.preco) return;
    setSalvandoItem(true);
    setErroForm(null);
    try {
      await criarItemCardapio(unidade.id, formParaDados(formItem, categoriaId));
      setFormItem(FORM_ITEM_VAZIO);
      setCategoriaFormAberto(null);
      await carregar();
    } catch (err) {
      setErroForm(err instanceof ApiError ? err.message : "Nao foi possivel criar o item.");
    } finally {
      setSalvandoItem(false);
    }
  }

  function abrirEdicaoItem(item: CardapioItem) {
    setEditandoItemId(item.id);
    setFormEdicaoItem(itemParaForm(item));
  }

  async function salvarEdicaoItem(e: React.FormEvent, categoriaId: string) {
    e.preventDefault();
    if (!unidade || !editandoItemId) return;
    try {
      await atualizarItemCardapio(unidade.id, editandoItemId, formParaDados(formEdicaoItem, categoriaId));
      setEditandoItemId(null);
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel atualizar o item.");
    }
  }

  async function enviarImagem(itemId: string, arquivo: File) {
    if (!unidade) return;
    setEnviandoImagemItemId(itemId);
    setErroImagem(null);
    try {
      const itemAtualizado = await enviarImagemItemCardapio(unidade.id, itemId, arquivo);
      setFormEdicaoItem((form) => ({ ...form, imagemUrl: itemAtualizado.imagemUrl ?? "" }));
      await carregar();
    } catch (err) {
      setErroImagem(err instanceof ApiError ? err.message : "Nao foi possivel enviar a imagem.");
    } finally {
      setEnviandoImagemItemId(null);
    }
  }

  async function alternarAtivoItem(item: CardapioItem) {
    if (!unidade) return;
    try {
      await atualizarItemCardapio(unidade.id, item.id, { ativo: !item.ativo });
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel atualizar o item.");
    }
  }

  async function excluirItem(item: CardapioItem) {
    if (!unidade) return;
    if (!confirm(`Excluir o item "${item.nome}"?`)) return;
    try {
      await excluirItemCardapio(unidade.id, item.id);
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Nao foi possivel excluir o item.");
    }
  }

  if (!unidade) return <p>Carregando unidade...</p>;

  const linkPublico = `${window.location.origin}/cardapio/${unidade.id}`;

  async function copiarLinkPublico() {
    await navigator.clipboard.writeText(linkPublico);
    setLinkCopiado(true);
    setTimeout(() => setLinkCopiado(false), 2000);
  }

  return (
    <div>
      {erro && <p className="erro">{erro}</p>}

      <div className="cartao">
        <h3 style={{ marginTop: 0 }}>Cardápio digital</h3>
        <p className="texto-secundario" style={{ fontSize: "0.85rem", marginTop: 0 }}>
          Organize seu cardápio em categorias (ex: Entradas, Pratos principais, Bebidas) e cadastre os itens de cada
          uma. Categorias e itens desativados ficam ocultos da página pública, sem perder o cadastro.
        </p>
        <div className="linha-form" style={{ alignItems: "flex-end" }}>
          <label style={{ flex: 1 }}>
            Link público do cardápio (pra colocar num QR code na mesa)
            <input value={linkPublico} readOnly onFocus={(e) => e.target.select()} />
          </label>
          <button className="btn btn-secundario" type="button" onClick={copiarLinkPublico}>
            {linkCopiado ? "Copiado!" : "Copiar link"}
          </button>
        </div>
        <form className="linha-form" onSubmit={salvarCategoria}>
          <label style={{ flex: 1 }}>
            Nova categoria
            <input
              value={nomeNovaCategoria}
              onChange={(e) => setNomeNovaCategoria(e.target.value)}
              placeholder="Ex: Entradas"
              required
            />
          </label>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="btn" type="submit" disabled={salvandoCategoria}>
              Adicionar categoria
            </button>
          </div>
        </form>
      </div>

      {carregando ? (
        <p>Carregando...</p>
      ) : categorias.length === 0 ? (
        <p className="texto-secundario">Nenhuma categoria cadastrada ainda.</p>
      ) : (
        categorias.map((categoria) => (
          <div className="cartao" key={categoria.id}>
            {editandoCategoriaId === categoria.id ? (
              <form className="linha-form" onSubmit={salvarEdicaoCategoria}>
                <label style={{ flex: 1 }}>
                  Nome da categoria
                  <input value={nomeEdicaoCategoria} onChange={(e) => setNomeEdicaoCategoria(e.target.value)} required />
                </label>
                <div className="acoes">
                  <button className="btn" type="submit">
                    Salvar
                  </button>
                  <button className="btn btn-secundario" type="button" onClick={() => setEditandoCategoriaId(null)}>
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <h3 style={{ margin: 0, flex: 1 }}>
                  {categoria.nome} {!categoria.ativo && <span className="texto-secundario">(desativada)</span>}
                </h3>
                <button className="btn btn-secundario" onClick={() => abrirFormItem(categoria.id)}>
                  {categoriaFormAberto === categoria.id ? "Cancelar" : "Adicionar item"}
                </button>
                <button className="btn btn-secundario" onClick={() => abrirEdicaoCategoria(categoria)}>
                  Editar
                </button>
                <button className="btn btn-secundario" onClick={() => alternarAtivoCategoria(categoria)}>
                  {categoria.ativo ? "Desativar" : "Ativar"}
                </button>
                <button className="btn btn-perigo" onClick={() => excluirCategoria(categoria)}>
                  Excluir
                </button>
              </div>
            )}

            {categoriaFormAberto === categoria.id && (
              <form onSubmit={(e) => salvarItem(e, categoria.id)} style={{ marginTop: "1rem" }}>
                <div className="linha-form">
                  <label>
                    Nome do item
                    <input value={formItem.nome} onChange={(e) => setFormItem({ ...formItem, nome: e.target.value })} required />
                  </label>
                  <label>
                    Preço (R$)
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formItem.preco}
                      onChange={(e) => setFormItem({ ...formItem, preco: e.target.value })}
                      required
                    />
                  </label>
                  <label>
                    Serve até (pessoas)
                    <input
                      type="number"
                      min="1"
                      value={formItem.porcaoServePessoas}
                      onChange={(e) => setFormItem({ ...formItem, porcaoServePessoas: e.target.value })}
                    />
                  </label>
                </div>
                <label style={{ marginBottom: "0.75rem" }}>
                  Descrição
                  <input value={formItem.descricao} onChange={(e) => setFormItem({ ...formItem, descricao: e.target.value })} />
                </label>
                <div className="linha-form">
                  <label style={{ flex: 1 }}>
                    URL da imagem (opcional - dá pra enviar uma foto depois, editando o item)
                    <input
                      value={formItem.imagemUrl}
                      onChange={(e) => setFormItem({ ...formItem, imagemUrl: e.target.value })}
                      placeholder="https://..."
                    />
                  </label>
                  <label style={{ flex: 1 }}>
                    Tags (separadas por vírgula)
                    <input value={formItem.tags} onChange={(e) => setFormItem({ ...formItem, tags: e.target.value })} placeholder="vegano, picante" />
                  </label>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                  <input
                    type="checkbox"
                    checked={formItem.somenteMaiorIdade}
                    onChange={(e) => setFormItem({ ...formItem, somenteMaiorIdade: e.target.checked })}
                  />
                  Somente maiores de 18 anos
                </label>
                {erroForm && <p className="erro">{erroForm}</p>}
                <button className="btn" type="submit" disabled={salvandoItem}>
                  {salvandoItem ? "Salvando..." : "Salvar item"}
                </button>
              </form>
            )}

            {categoria.itens.length > 0 && (
              <div className="tabela-scroll">
              <table style={{ marginTop: "1rem" }}>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Preço</th>
                    <th>Detalhes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {categoria.itens.map((item) =>
                    editandoItemId === item.id ? (
                      <tr key={item.id}>
                        <td colSpan={4}>
                          <form onSubmit={(e) => salvarEdicaoItem(e, categoria.id)}>
                            <div className="linha-form">
                              <label>
                                Nome
                                <input
                                  value={formEdicaoItem.nome}
                                  onChange={(e) => setFormEdicaoItem({ ...formEdicaoItem, nome: e.target.value })}
                                  required
                                />
                              </label>
                              <label>
                                Preço (R$)
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={formEdicaoItem.preco}
                                  onChange={(e) => setFormEdicaoItem({ ...formEdicaoItem, preco: e.target.value })}
                                  required
                                />
                              </label>
                              <label>
                                Serve até (pessoas)
                                <input
                                  type="number"
                                  min="1"
                                  value={formEdicaoItem.porcaoServePessoas}
                                  onChange={(e) => setFormEdicaoItem({ ...formEdicaoItem, porcaoServePessoas: e.target.value })}
                                />
                              </label>
                            </div>
                            <label style={{ marginBottom: "0.75rem" }}>
                              Descrição
                              <input
                                value={formEdicaoItem.descricao}
                                onChange={(e) => setFormEdicaoItem({ ...formEdicaoItem, descricao: e.target.value })}
                              />
                            </label>
                            <div className="linha-form">
                              <label style={{ flex: 1 }}>
                                URL da imagem (ou cole um link já hospedado)
                                <input
                                  value={formEdicaoItem.imagemUrl}
                                  onChange={(e) => setFormEdicaoItem({ ...formEdicaoItem, imagemUrl: e.target.value })}
                                />
                              </label>
                              <label style={{ flex: 1 }}>
                                Tags (separadas por vírgula)
                                <input
                                  value={formEdicaoItem.tags}
                                  onChange={(e) => setFormEdicaoItem({ ...formEdicaoItem, tags: e.target.value })}
                                />
                              </label>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
                              {formEdicaoItem.imagemUrl && (
                                <img
                                  src={formEdicaoItem.imagemUrl}
                                  alt=""
                                  style={{ width: "48px", height: "48px", objectFit: "cover", borderRadius: "6px" }}
                                />
                              )}
                              <label style={{ flex: 1 }}>
                                Ou envie uma foto do produto (JPG, PNG, WEBP ou GIF, até 3MB)
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp,image/gif"
                                  disabled={enviandoImagemItemId === item.id}
                                  onChange={(e) => {
                                    const arquivo = e.target.files?.[0];
                                    if (arquivo) enviarImagem(item.id, arquivo);
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                              {enviandoImagemItemId === item.id && <span className="texto-secundario">Enviando...</span>}
                            </div>
                            {erroImagem && <p className="erro">{erroImagem}</p>}
                            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                              <input
                                type="checkbox"
                                checked={formEdicaoItem.somenteMaiorIdade}
                                onChange={(e) => setFormEdicaoItem({ ...formEdicaoItem, somenteMaiorIdade: e.target.checked })}
                              />
                              Somente maiores de 18 anos
                            </label>
                            <div className="acoes">
                              <button className="btn" type="submit">
                                Salvar
                              </button>
                              <button className="btn btn-secundario" type="button" onClick={() => setEditandoItemId(null)}>
                                Cancelar
                              </button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    ) : (
                      <tr key={item.id}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            {item.imagemUrl && (
                              <img
                                src={item.imagemUrl}
                                alt=""
                                style={{ width: "36px", height: "36px", objectFit: "cover", borderRadius: "6px", flexShrink: 0 }}
                              />
                            )}
                            <div>
                              {item.nome} {!item.ativo && <span className="texto-secundario">(desativado)</span>}
                              {item.descricao && (
                                <div className="texto-secundario" style={{ fontSize: "0.8rem" }}>
                                  {item.descricao}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>{formatarPreco(item.precoCentavos)}</td>
                        <td style={{ fontSize: "0.8rem" }}>
                          {item.porcaoServePessoas != null && <div>Serve até {item.porcaoServePessoas}</div>}
                          {item.somenteMaiorIdade && <div>+18</div>}
                          {item.tags && item.tags.length > 0 && <div>{item.tags.join(", ")}</div>}
                        </td>
                        <td>
                          <div className="acoes">
                            <button className="btn btn-secundario" onClick={() => abrirEdicaoItem(item)}>
                              Editar
                            </button>
                            <button className="btn btn-secundario" onClick={() => alternarAtivoItem(item)}>
                              {item.ativo ? "Desativar" : "Ativar"}
                            </button>
                            <button className="btn btn-perigo" onClick={() => excluirItem(item)}>
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
