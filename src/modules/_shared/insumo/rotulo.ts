/**
 * Como um insumo aparece onde alguém o escolhe: "BRITA 0 - t", "BRITA 0 - m3".
 *
 * Desde 30/09/2026 dois insumos podem ter o mesmo nome se a unidade for outra
 * (a brita comprada por tonelada e a comprada por metro cúbico são cadastros
 * diferentes). O nome sozinho deixou de identificar o material, então todo
 * seletor de OC, cotação, frete, pedido de material, combustível e almoxarifado
 * mostra o rótulo, e a importação por planilha aceita o rótulo para desempatar.
 */
export function rotuloInsumo(nome: string, unidade: string | null | undefined): string {
  const sigla = unidade?.trim();
  return sigla ? `${nome} - ${sigla}` : nome;
}
