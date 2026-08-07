import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { clientes } from "../db/schema/index.js";

export interface DadosOptInCliente {
  empresaId: string;
  telefone: string;
  nome?: string;
  dataNascimento?: string;
  whatsappOptIn?: boolean;
}

// Upsert por (empresa_id, telefone) - chamado quando a pagina publica de reserva
// recebe telefone + (opcionalmente) data de nascimento/opt-in de WhatsApp. So marca
// whatsapp_opt_in como true explicitamente quando o cliente marcou a caixa NESTA
// reserva - nunca reseta pra false aqui (o unico jeito de desligar e opt-out via
// mensagem, ver webhook) e nunca assume opt-in por padrao (checkbox sempre comeca
// desmarcado no formulario publico).
export async function salvarOuAtualizarCliente(db: Database, dados: DadosOptInCliente): Promise<void> {
  const [existente] = await db
    .select()
    .from(clientes)
    .where(and(eq(clientes.empresaId, dados.empresaId), eq(clientes.telefone, dados.telefone)))
    .limit(1);

  if (existente) {
    await db
      .update(clientes)
      .set({
        nome: dados.nome ?? existente.nome,
        dataNascimento: dados.dataNascimento ?? existente.dataNascimento,
        ...(dados.whatsappOptIn ? { whatsappOptIn: true, whatsappOptInEm: new Date() } : {}),
      })
      .where(eq(clientes.id, existente.id));
    return;
  }

  await db.insert(clientes).values({
    empresaId: dados.empresaId,
    telefone: dados.telefone,
    nome: dados.nome,
    dataNascimento: dados.dataNascimento,
    whatsappOptIn: dados.whatsappOptIn ?? false,
    whatsappOptInEm: dados.whatsappOptIn ? new Date() : null,
  });
}
