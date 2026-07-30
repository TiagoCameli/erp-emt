import type { OpcaoFiltro } from "@/components/canonicos";

/**
 * Opções de um filtro montadas a partir dos valores que EXISTEM na lista
 * carregada, sem duplicata, vazio nem nulo, ordenadas em pt-BR.
 *
 * Serve os cadastros de campo livre (cidade, UF, rodovia, lote, tipo e marca de
 * equipamento, CBO): não há tabela de domínio para consultar, então a lista de
 * opções é o que está cadastrado. O efeito colateral é bom: o filtro nunca
 * oferece uma opção que não devolve nada.
 */
export function opcoesDistintas(
  valores: readonly (string | null | undefined)[],
): OpcaoFiltro[] {
  const vistos = new Set<string>();
  for (const valor of valores) {
    const limpo = valor?.trim();
    if (limpo) vistos.add(limpo);
  }
  return [...vistos]
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((valor) => ({ valor, rotulo: valor }));
}

/**
 * Mesma ideia para valores numéricos (ano do equipamento, nº de parcelas),
 * com a ordem do maior para o menor: ano recente e parcelamento maior são o
 * que se procura primeiro.
 */
export function opcoesNumericasDistintas(
  valores: readonly (number | null | undefined)[],
): OpcaoFiltro[] {
  const vistos = new Set<number>();
  for (const valor of valores) {
    if (typeof valor === "number" && Number.isFinite(valor)) vistos.add(valor);
  }
  return [...vistos]
    .sort((a, b) => b - a)
    .map((valor) => ({ valor: String(valor), rotulo: String(valor) }));
}
