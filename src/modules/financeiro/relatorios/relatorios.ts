/**
 * Identidade dos relatórios financeiros: os ids válidos, o padrão e a
 * normalização do parâmetro `rel` da URL.
 *
 * Vive num módulo neutro (sem "use client") de propósito. Isto morava dentro de
 * `relatorios-nav.tsx`, que é client component, e a página (Server Component)
 * CHAMAVA `normalizarRelatorio` de lá. Importar um client component do servidor
 * é permitido para renderizar; chamar uma função exportada por ele não é, e o
 * Next levanta "Attempted to call normalizarRelatorio() from the server but
 * normalizarRelatorio is on the client".
 *
 * Isso derrubava a tela inteira de relatórios em produção, nos sete relatórios,
 * antes de qualquer consulta ao banco. E passava por tsc, lint, testes e build,
 * porque é violação de fronteira de runtime, não de tipo: só aparece quando a
 * rota renderiza de verdade.
 */

/** Identificador de cada relatório (também o valor do parâmetro `rel`). */
export type RelatorioId =
  | "fluxo-caixa"
  | "dre"
  | "aging"
  | "posicao-bancaria"
  | "custo-cc"
  | "custo-receita"
  | "custo-grupo"
  | "extrato-fornecedor";

/** Ordem dos relatórios na navegação. */
export const RELATORIOS: readonly RelatorioId[] = [
  "fluxo-caixa",
  "dre",
  "aging",
  "posicao-bancaria",
  "custo-cc",
  "custo-receita",
  "custo-grupo",
  "extrato-fornecedor",
];

export const RELATORIO_PADRAO: RelatorioId = "fluxo-caixa";

const IDS_VALIDOS = new Set<string>(RELATORIOS);

/** Normaliza o parâmetro `rel` num RelatorioId, com fallback no padrão. */
export function normalizarRelatorio(valor: string | undefined): RelatorioId {
  return valor && IDS_VALIDOS.has(valor)
    ? (valor as RelatorioId)
    : RELATORIO_PADRAO;
}
