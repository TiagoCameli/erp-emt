/**
 * Ordenação da listagem de lançamentos: quais colunas ordenam, para que coluna
 * do banco cada uma aponta, e como isso vive na URL.
 *
 * **Ordena no SERVIDOR, sobre o filtro inteiro.** A lista é paginada de 25 em 25
 * sobre milhares de lançamentos, então ordenar só a página carregada mostraria o
 * maior valor DA PÁGINA quando a pessoa pede o maior valor. Numa tela de dinheiro
 * isso não é limitação, é resposta errada com cara de certa.
 *
 * Por isso o catálogo é uma lista FECHADA de colunas que existem na tabela
 * `lancamentos`. Fica de fora, de propósito:
 *
 * - **Fornecedor e Categoria**: vêm de join (`fornecedores`, `categorias_financeiras`).
 * - **Revisão** e os valores **pago / aberto / vencido**: são calculados no app a
 *   partir das parcelas, não existem como coluna.
 *
 * Essas colunas são declaradas `enableSorting: false` na tabela, então não ganham
 * seta: melhor não oferecer do que oferecer e ordenar errado. O teste
 * `lancamentos-tabela.test.tsx` amarra as duas pontas, para a tela e este catálogo
 * não divergirem.
 *
 * Módulo puro: nada de banco e nada de React.
 */

/** Coluna da tela -> coluna da tabela `lancamentos`. Lista fechada. */
export const COLUNA_DO_BANCO = {
  numero: "numero",
  numeroDocumento: "numero_documento",
  tipo: "tipo",
  descricao: "descricao",
  valor: "valor",
  dataCompra: "data_compra",
  mesCompetencia: "mes_competencia",
  dataVencimento: "data_vencimento",
  status: "status",
} as const;

export type OrdemLancamentos = keyof typeof COLUNA_DO_BANCO;
export type DirecaoOrdem = "asc" | "desc";

/**
 * Ordem padrão: data da compra, do mais novo para o mais velho. É a que a
 * listagem sempre usou, e é o que o operador financeiro espera ver ao abrir a
 * tela (o que entrou por último).
 */
export const ORDEM_PADRAO: OrdemLancamentos = "dataCompra";
export const DIRECAO_PADRAO: DirecaoOrdem = "desc";

/**
 * Interpreta a ordenação que veio da URL. Valor desconhecido cai no padrão em vez
 * de erro: a URL é editável e é compartilhada por link, e ordem inventada não pode
 * derrubar a tela nem chegar crua no `order` do banco.
 *
 * Direção só é respeitada com coluna válida; direção estranha em coluna válida cai
 * em `desc` sem perder a coluna, que é o que a pessoa pediu de fato.
 */
export function lerOrdenacao(
  ordem: string | string[] | undefined,
  direcao: string | string[] | undefined,
): { ordem: OrdemLancamentos; direcao: DirecaoOrdem } {
  const nomeOrdem = Array.isArray(ordem) ? ordem[0] : ordem;
  const nomeDirecao = Array.isArray(direcao) ? direcao[0] : direcao;

  const valida = Object.hasOwn(COLUNA_DO_BANCO, nomeOrdem ?? "");
  if (!valida) return { ordem: ORDEM_PADRAO, direcao: DIRECAO_PADRAO };

  return {
    ordem: nomeOrdem as OrdemLancamentos,
    direcao: nomeDirecao === "asc" ? "asc" : "desc",
  };
}

/**
 * A ordenação do jeito que vai para a query string. O padrão sai vazio para o
 * link ficar limpo: URL só carrega o que a pessoa escolheu, como os filtros.
 */
export function ordenacaoParaUrl(
  ordem: OrdemLancamentos,
  direcao: DirecaoOrdem,
): { ordem?: OrdemLancamentos; direcao?: DirecaoOrdem } {
  if (ordem === ORDEM_PADRAO && direcao === DIRECAO_PADRAO) return {};
  return { ordem, direcao };
}
