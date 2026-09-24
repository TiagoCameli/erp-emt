/**
 * Cores da Visão Geral do Combustível. Módulo puro (servidor e cliente).
 *
 * A estrutura dos gráficos é a da origem; as cores são as do ERP (a marca, não o azul da
 * origem). A cor segue a ENTIDADE, nunca a posição no ranking: o mesmo combustível tem a
 * mesma cor na rosca e no selo da tabela, e filtrar não repinta ninguém.
 */

export const COR_PAINEL = {
  /** Volume, barras de ranking, sparkline: o verde da marca. */
  principal: "var(--color-emt-verde)",
  /** Item marcado no filtro (a `accent-hover` da origem). */
  marcado: "var(--color-emt-verde-escuro)",
  /** Custo (a linha preta da origem): o asfalto. */
  custo: "var(--color-emt-asfalto)",
  /**
   * O que pede atenção sem ser erro: o sentinela ("Não identificado") e o fornecedor acima
   * da média. É o âmbar, e não o vermelho da origem: verde x vermelho some em deuteranopia
   * (ΔE 5,2), verde x âmbar passa (14,7).
   */
  atencao: "var(--color-emt-amarelo)",
  /** "Outros", "Sem obra": agregado, não é entidade. */
  agregado: "var(--color-status-rascunho)",
} as const;

/** Id do grupo "Outros" do mix (saída sem combustível), o `_outros` da origem. */
export const ID_OUTROS_COMBUSTIVEIS = "_outros";

/**
 * Cor do combustível pelo NOME (a `corCombustivel` da origem, com as cores do ERP). Casa por
 * trecho, então "Diesel S10 (BR)" é o S10.
 */
export function corDoCombustivel(nome: string | null | undefined, id?: string): string {
  if (id === ID_OUTROS_COMBUSTIVEIS) return COR_PAINEL.agregado;
  const chave = (nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (chave.includes("s500")) return COR_PAINEL.custo;
  if (chave.includes("s10") || chave.includes("diesel")) return COR_PAINEL.principal;
  if (chave.includes("arla")) return COR_PAINEL.atencao;
  if (chave.includes("gasolina")) return "#3b6ea5";
  if (chave.includes("etanol")) return "#8fb79a";
  return "#7a5c99";
}
