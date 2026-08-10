import { useEffect, useState } from "react";
import { ApiError } from "../api/client.js";
import { listarConexoesWhatsapp } from "../api/resources.js";
import type { WhatsappConnection } from "../types.js";

function ConexaoWhatsapp() {
  const [conexoes, setConexoes] = useState<WhatsappConnection[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    listarConexoesWhatsapp()
      .then(setConexoes)
      .catch((err) => setErro(err instanceof ApiError ? err.message : "Nao foi possivel carregar a conexao."))
      .finally(() => setCarregando(false));
  }, []);

  return (
    <div className="cartao">
      <h3 style={{ marginTop: 0 }}>Conexao com o WhatsApp</h3>
      <p className="texto-secundario" style={{ marginTop: 0, fontSize: "0.85rem" }}>
        A conexao e feita pela equipe tecnica, colando o token de acesso do WhatsApp Business API da sua empresa
        (mesmo processo usado para o Instagram). Aqui voce so acompanha o status.
      </p>
      {carregando ? (
        <p>Carregando...</p>
      ) : erro ? (
        <p className="erro">{erro}</p>
      ) : conexoes.length === 0 ? (
        <p className="texto-secundario">
          <span className="badge badge-cancelada">Desconectado</span> Nenhum numero de WhatsApp conectado ainda.
        </p>
      ) : (
        <div className="tabela-scroll">
        <table>
          <thead>
            <tr>
              <th>Numero (Phone Number ID)</th>
              <th>Status</th>
              <th>Conectado em</th>
            </tr>
          </thead>
          <tbody>
            {conexoes.map((c) => (
              <tr key={c.id}>
                <td>{c.phoneNumberId}</td>
                <td>
                  <span className={`badge ${c.status === "ativo" ? "badge-confirmada" : "badge-cancelada"}`}>
                    {c.status === "ativo" ? "Conectado" : "Desconectado"}
                  </span>
                </td>
                <td>{new Date(c.conectadoEm).toLocaleDateString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

// TODO (item 5.1): quando conectado, exibir aqui um painel estilo WhatsApp Web com o
// chat das conversas (por enquanto so mostra o status da conexao).
export function WhatsAppPage() {
  return (
    <div>
      <ConexaoWhatsapp />
    </div>
  );
}
