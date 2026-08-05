// drizzle-orm envolve o erro original do driver `pg` num DrizzleQueryError, com o
// erro do Postgres (que tem `.code`) em `.cause` - nunca `.code` direto no topo.
// Esta funcao cobre os dois formatos para nao depender de detalhe de implementacao.
export function codigoDoErroPostgres(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  if ("code" in err && typeof err.code === "string") return err.code;
  if ("cause" in err && typeof err.cause === "object" && err.cause !== null && "code" in err.cause) {
    const codigo = (err.cause as { code?: unknown }).code;
    return typeof codigo === "string" ? codigo : undefined;
  }
  return undefined;
}
