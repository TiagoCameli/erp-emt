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
  | "investimentos"
  | "custo-cc"
  | "resultado-obra"
  | "custo-grupo"
  | "extrato-fornecedor"
  | "socios-ligadas"
  | "aquisicoes"
  | "indireto";

/** Ordem dos relatórios na navegação. */
export const RELATORIOS: readonly RelatorioId[] = [
  "dre",
  "resultado-obra",
  "custo-cc",
  "fluxo-caixa",
  "posicao-bancaria",
  "aging",
  "investimentos",
  "custo-grupo",
  "indireto",
  "extrato-fornecedor",
  "aquisicoes",
  "socios-ligadas",
];


/**
 * Os relatórios agrupados pela pergunta de quem abre a tela. Treze botões em
 * fila não dizem por onde começar; quatro grupos dizem. A ordem de `RELATORIOS`
 * é a destes grupos lidos em sequência (teste em relatorios-grupos.test.ts).
 */
export const GRUPOS_RELATORIOS: readonly {
  titulo: string;
  relatorios: readonly RelatorioId[];
}[] = [
  { titulo: "Resultado", relatorios: ["dre", "resultado-obra", "custo-cc"] },
  {
    titulo: "Caixa",
    relatorios: ["fluxo-caixa", "posicao-bancaria", "aging", "investimentos"],
  },
  {
    titulo: "Custo",
    relatorios: ["custo-grupo", "indireto", "extrato-fornecedor"],
  },
  { titulo: "Patrimônio e sócios", relatorios: ["aquisicoes", "socios-ligadas"] },
];

/**
 * A pergunta que cada relatório responde, em uma linha. Abre a seção; o
 * "como a conta é feita" fica recolhido embaixo dela.
 */
export const PERGUNTA_DO_RELATORIO: Record<RelatorioId, string> = {
  dre: "A empresa deu lucro no período? Quanto de cada real recebido sobrou?",
  "resultado-obra": "Quais obras dão lucro, quais estão no vermelho, e quanto?",
  "custo-cc": "Onde o dinheiro foi gasto, filtrando por centro, categoria, fornecedor e forma?",
  "fluxo-caixa": "Quanto entrou, quanto saiu e como fica o saldo nos próximos meses?",
  "posicao-bancaria": "Quanto tem em cada conta hoje?",
  aging: "Quanto está vencido e quanto vence nos próximos dias?",
  investimentos: "Quanto está aplicado e quanto rendeu?",
  "custo-grupo": "O custo foi para material, mão de obra ou equipamento?",
  indireto: "Quanto custou o escritório e a manutenção em cada mês, e quanto disso cada obra carrega?",
  "extrato-fornecedor": "Quanto devo e quanto já paguei a cada fornecedor?",
  aquisicoes: "Quanto custou cada máquina e quanto falta pagar?",
  "socios-ligadas": "Quanto foi para os sócios e para as empresas ligadas, e quanto voltou?",
};

export const RELATORIO_PADRAO: RelatorioId = "fluxo-caixa";

/** Nome do parâmetro que diz QUAL relatório está aberto. */
export const PARAM_RELATORIO = "rel";

/** Visão do Resultado por obra: o padrão (por obra) ou "cruzar" centros. */
export const PARAM_VISAO = "visao";

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
export const PARAMS_DE_NAVEGACAO: readonly string[] = [PARAM_RELATORIO, PARAM_VISAO];

const IDS_VALIDOS = new Set<string>(RELATORIOS);

/**
 * Os ids que deixaram de existir em 15/10/2026, quando Custo x receita virou
 * Resultado por obra e Custos indiretos + Rateio do indireto viraram Indireto.
 * Link antigo e favorito continuam abrindo o relatório certo (a página
 * redireciona, na MESMA rota, para o id novo: não há laço pela memória de
 * filtros da sessão, porque o destino não redireciona de novo).
 */
export const ID_ANTIGO: Readonly<Record<string, RelatorioId>> = {
  "custo-receita": "resultado-obra",
  "custos-indiretos": "indireto",
  "rateio-indireto": "indireto",
};

/**
 * A query do id novo a partir da de um id antigo, ou `null` se `rel` não é
 * antigo. Custo x receita com centro, etapa, meses ou investimento escolhidos
 * abre na visão "Cruzar centros", que é aquele relatório inteiro; sem filtro,
 * abre no resultado por obra.
 */
export function queryDoIdAntigo(params: URLSearchParams): string | null {
  const antigo = params.get(PARAM_RELATORIO);
  const novo = antigo ? ID_ANTIGO[antigo] : undefined;
  if (!novo) return null;
  const saida = new URLSearchParams(params);
  saida.set(PARAM_RELATORIO, novo);
  const filtrosDoCruzar = [
    "centro_custo",
    "centro_receita",
    "etapa_custo",
    "etapa_receita",
    "mes_ref",
    "com_investimento",
  ];
  if (antigo === "custo-receita" && filtrosDoCruzar.some((p) => saida.has(p))) {
    saida.set(PARAM_VISAO, "cruzar");
  }
  return saida.toString();
}


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
 * atrasado, em Dívidas).
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
