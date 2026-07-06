import "server-only";

/**
 * Loga o erro real no servidor (aparece nos logs da Vercel) sem expor
 * detalhe técnico ao usuário. `contexto` identifica o ponto de origem
 * no formato "modulo.aba.operacao" (ex: "cadastros.clientes.criar").
 */
export function logErroServidor(contexto: string, erro: unknown): void {
  console.error(`[erp-emt] ${contexto}`, erro);
}

/**
 * Padrão das Server Actions: loga o erro real e devolve a mensagem
 * amigável que a tela já mostrava.
 *
 *   if (error) return erroAcao("cadastros.clientes.criar", error, "Não foi possível salvar o cliente. Tente novamente.");
 */
export function erroAcao(
  contexto: string,
  erro: unknown,
  mensagem: string,
): { erro: string } {
  logErroServidor(contexto, erro);
  return { erro: mensagem };
}
