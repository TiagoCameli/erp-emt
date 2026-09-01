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

/**
 * Texto curto e legível de um throw qualquer, para caber num toast.
 *
 * A Vercel do erp-emt é plano hobby: `get_runtime_logs` e `get_runtime_errors`
 * devolvem 403, então NÃO existe log de aplicação para consultar
 * ([[feedback_digest_do_next_se_resolve_no_edge_log]]). Se a mensagem não subir
 * na tela, ela não existe em lugar nenhum, e a investigação vira chute.
 */
export function textoDoErro(erro: unknown): string {
  if (erro instanceof Error) {
    const codigo = (erro as { code?: unknown }).code;
    const sufixo = typeof codigo === "string" && codigo ? ` [${codigo}]` : "";
    return `${erro.message}${sufixo}`.slice(0, 300);
  }
  if (typeof erro === "string") return erro.slice(0, 300);
  return String(erro).slice(0, 300);
}

/**
 * Roda o corpo de uma Server Action e converte QUALQUER throw no contrato
 * `{ erro }`.
 *
 * **Server Action não pode lançar para o cliente.** Quando lança, o `await` do
 * componente rejeita, o `if ("erro" in resultado)` nunca roda, e a tela não tem
 * como dizer o que aconteceu — na melhor das hipóteses aparece um aviso
 * genérico ("recarregue a página"), que é verdade mas não é diagnóstico.
 * Aconteceu na aprovação da folha de 08/2026: a pessoa clicava, nada acontecia,
 * e não havia UMA linha de log para consultar.
 *
 * O que sobe para o toast inclui o texto real do erro de propósito. O padrão do
 * app é esconder detalhe técnico (`erroAcao`), e isso continua valendo para o
 * erro ESPERADO — mas falha inesperada em botão de dinheiro é diferente: sem o
 * texto, ninguém (nem o Tiago, nem eu depois) consegue nomear a causa. Erro de
 * Postgres e do Next não carrega segredo; carrega o nome da trava que pegou.
 *
 *   export async function aprovarFolha(id: string) {
 *     return semLancar("rh.folha.aprovar", async () => { ...corpo... });
 *   }
 */
export async function semLancar<T>(
  contexto: string,
  corpo: () => Promise<T>,
): Promise<T | { erro: string }> {
  try {
    return await corpo();
  } catch (erro) {
    return erroAcao(
      contexto,
      erro,
      `Falha inesperada em ${contexto}: ${textoDoErro(erro)}`,
    );
  }
}
