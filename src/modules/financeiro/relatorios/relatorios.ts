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
  | "creditos"
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
  "creditos",
  "custo-cc",
  "custo-receita",
  "custo-grupo",
  "extrato-fornecedor",
];

export const RELATORIO_PADRAO: RelatorioId = "fluxo-caixa";

/** Nome do parâmetro que diz QUAL relatório está aberto. */
export const PARAM_RELATORIO = "rel";

/**
 * O que, nesta tela, é NAVEGAÇÃO e não filtro — para o "Limpar filtros" não
 * apagar junto.
 *
 * `rel` é a identidade do relatório, do mesmo jeito que o pathname é a
 * identidade de uma tela comum. Antes ele caía com os filtros: marcar um centro
 * em "Custo por centro de custo" e clicar em "Limpar filtros" devolvia a pessoa
 * ao Fluxo de caixa, e a sessão passava a lembrar da tela sem relatório nenhum.
 *
 * Vive AQUI, e não na lista global do `filter-bar`, porque aquela lista vale
 * para as 16 telas com filtro na URL e reservaria o nome `rel` no app inteiro.
 * O canônico aceita esta lista por chamada (`useFiltrosUrl({ naoSaoFiltro })`),
 * então quem conhece o parâmetro é quem o declara — e continua havendo uma
 * implementação só de "apagar filtro", que é o que impede a lista de filtros de
 * cada tela sair de sincronia.
 */
export const PARAMS_DE_NAVEGACAO: readonly string[] = [PARAM_RELATORIO];

const IDS_VALIDOS = new Set<string>(RELATORIOS);

/** Normaliza o parâmetro `rel` num RelatorioId, com fallback no padrão. */
export function normalizarRelatorio(valor: string | undefined): RelatorioId {
  return valor && IDS_VALIDOS.has(valor)
    ? (valor as RelatorioId)
    : RELATORIO_PADRAO;
}

/**
 * Como um NÚMERO de resultado se lê: a favor, contra, ou nem uma coisa nem
 * outra.
 *
 * Existe porque o DRE e o Custo por centro de custo pintavam superávit de
 * `text-status-aprovado` e déficit de `text-status-rejeitado`. Esses dois hexes
 * são o vocabulário da máquina de status: verde ali quer dizer "isto passou pela
 * aprovação" e vermelho quer dizer "rejeitado ou vencido". Superávit não passou
 * por aprovação nenhuma, e custo que subiu não foi rejeitado por ninguém — usar
 * a cor do status para falar de sinal de número gasta um significado que o app
 * inteiro depende de manter estável.
 */
export type SinalDeValor = "favoravel" | "desfavoravel" | "neutro";

/**
 * A classe de cor de cada sinal.
 *
 * Hoje o lado favorável fica SEM cor própria (a tinta da tabela,
 * `text-foreground`): a paleta não tem um verde de valor, e os dois verdes que
 * existem já falam outra coisa — `--status-aprovado` é status e `--emt-verde` é
 * o `--primary`, que nestas mesmas tabelas é a cor dos links de drill-down (um
 * total verde pareceria clicável). Inventar um terceiro verde fora da paleta
 * seria pior que ficar sem. O lado desfavorável usa `text-destructive`, que é o
 * vermelho de "este número é ruim" e já é usado assim no módulo (o vencimento
 * atrasado, em Créditos).
 *
 * Quando existirem os tokens `--valor-positivo` e `--valor-negativo` no
 * `globals.css`, é AQUI que eles entram, e as duas tabelas seguem junto sem
 * mudar uma linha.
 */
export function classeDoSinal(sinal: SinalDeValor): string {
  switch (sinal) {
    case "favoravel":
      return "text-foreground";
    case "desfavoravel":
      return "text-destructive";
    case "neutro":
      return "text-muted-foreground";
  }
}

/**
 * O sinal de um RESULTADO (receita menos despesa): sobrar é a favor, faltar é
 * contra. Zero é neutro — não sobrou nem faltou.
 */
export function sinalDoResultado(valor: number): SinalDeValor {
  if (valor > 0) return "favoravel";
  if (valor < 0) return "desfavoravel";
  return "neutro";
}

/**
 * O sinal de uma VARIAÇÃO DE CUSTO, que anda ao contrário do resultado: custo
 * que subiu é contra, custo que caiu é a favor.
 */
export function sinalDaVariacaoDeCusto(diferenca: number): SinalDeValor {
  if (diferenca > 0) return "desfavoravel";
  if (diferenca < 0) return "favoravel";
  return "neutro";
}
