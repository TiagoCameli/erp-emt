/**
 * Abre o drill-down de uma barra de gráfico, em aba nova.
 *
 * Existe porque o Recharts desenha `<path>`, não âncora: nos gráficos o clique é
 * `onClick` e a navegação é na mão. Nas TABELAS o clique é link de verdade (ver
 * `LinkDrill`), e é lá que o meio-clique e o copiar-link funcionam — a tabela
 * mostra a mesma informação do gráfico, então nada se perde.
 *
 * `noopener` junto do `_blank` de propósito: sem ele a aba nova recebe acesso ao
 * `window.opener` desta.
 *
 * Barra sem destino (ex: a barra "Outros", que agrupa vários centros e não tem
 * uma lista correspondente) simplesmente não faz nada.
 */
export function abrirDrill(href: string | undefined): void {
  if (!href) return;
  window.open(href, "_blank", "noopener");
}
