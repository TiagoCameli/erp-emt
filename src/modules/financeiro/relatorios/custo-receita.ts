import { paraCentavos, paraReais } from "@/modules/financeiro/relatorios/calculo";

/**
 * As três leituras do relatório de Custo x receita, todas somando as MESMAS
 * linhas.
 *
 * A RPC devolve o grão fino (um registro por mês x centro-raiz x tipo) e este
 * módulo agrega de três jeitos: total (cartões), por mês (gráfico) e por centro
 * (tabelas). Uma agregação por consulta seria a quarta vez em dois dias que duas
 * contas do mesmo dinheiro divergem neste projeto -- e a divergência aparece como
 * "o gráfico não fecha com o cartão", que é o pior jeito de descobrir.
 *
 * Toda soma passa por CENTAVOS inteiros. Somar reais em ponto flutuante sobre
 * dezenas de linhas acumula resto, e aí o total da tabela deixa de bater com o
 * cartão por um centavo -- num relatório de dinheiro, um centavo de diferença
 * custa a confiança no resto.
 *
 * Módulo puro: nada de banco, nada de React.
 */

export type TipoCustoReceita = "a_pagar" | "a_receber";

/**
 * Natureza da categoria do lançamento, como a RPC devolve.
 *
 * Só duas chegam aqui: a RPC filtra `in ('operacional','movimentacao')`, e
 * 'financeira' fica de fora. A distinção existe porque as duas NÃO podem somar no
 * mesmo lugar: `movimentacao` é dinheiro que entra e tem de ser devolvido
 * (empréstimo tomado) ou que só troca de bolso (aplicação e resgate). Somar isso
 * como receita infla o resultado -- a varredura do banco era 31,7% da receita de
 * 2026 antes de sair do sistema, em 22/08/2026.
 */
export type NaturezaCustoReceita = "operacional" | "movimentacao";

/** Uma linha do grão fino, como a RPC devolve (valores já em reais). */
export interface LinhaCustoReceita {
  /** yyyy-MM. */
  mes: string;
  tipo: TipoCustoReceita;
  /**
   * `operacional` é o que forma custo, receita e resultado. `movimentacao` é
   * empréstimo tomado (e, se voltar a ser lançada, a varredura): aparece na tela
   * numa faixa própria e NÃO entra em nenhum dos quatro cartões.
   */
  natureza: NaturezaCustoReceita;
  centroCustoId: string;
  nome: string;
  codigo: string | null;
  total: number;
  /** Retenção na fonte da fatia deste rateio. Zero no custo. */
  retencao: number;
}

export interface TotaisCustoReceita {
  custo: number;
  /** O que a obra recebe: é a base do resultado (decisão do dono). */
  receitaLiquida: number;
  /**
   * Líquida MAIS a retenção. É uma soma, e não o `valor_bruto` da nota.
   *
   * Os dois quase sempre coincidem, mas não é garantido: medido em 22/08/2026, em
   * 9 documentos com retenção, o LAN-2026-6196 tem `valor_bruto` R$ 2.367.081,49
   * contra R$ 2.367.081,50 de líquido + retido. O pagador arredonda, e é por isso
   * que o a receber tem tolerância de R$ 1,00 na conferência.
   *
   * Somar aqui, em vez de trazer `valor_bruto`, é de propósito: o bruto é do
   * DOCUMENTO e não tem centro de custo, e este relatório fatia tudo por centro.
   * A tela chama isto de "somando", não de "faturado", para não prometer a nota.
   */
  receitaFaturada: number;
  retencao: number;
  resultado: number;
  /**
   * Resultado sobre a receita líquida, em pontos percentuais.
   *
   * `null` sem receita, e isso importa: centro que só tem custo (carretas,
   * equipamentos) não tem margem. Zero se leria como "não sobrou nada da
   * receita", e cem por cento como lucro total.
   */
  margem: number | null;
  /**
   * Empréstimo tomado no recorte (natureza `movimentacao`, lado a receber).
   *
   * FORA do resultado e da margem, de propósito: é dinheiro que entrou e tem de
   * ser devolvido. Existe como número próprio porque some-lo em "receita" faria o
   * centro Empréstimos parecer lucrativo, e omiti-lo fazia o mesmo centro
   * aparecer com custo de R$ 2,84 milhões e receita zero -- que foi o print que
   * o Tiago mandou em 27/08/2026.
   */
  movimentacaoEntrada: number;
  /** O outro lado da movimentação (aplicação, amortização lançada como tal). */
  movimentacaoSaida: number;
}

function somarCentavos(
  linhas: readonly LinhaCustoReceita[],
  campo: "total" | "retencao",
  tipo?: TipoCustoReceita,
  natureza: NaturezaCustoReceita = "operacional",
): number {
  return linhas.reduce((soma, linha) => {
    if (tipo && linha.tipo !== tipo) return soma;
    // A natureza tem default 'operacional' de propósito: antes de 27/08/2026 a
    // RPC só devolvia operacional, e todo cálculo desta tela era sobre ela. Quem
    // quiser movimentação pede explicitamente.
    if (linha.natureza !== natureza) return soma;
    return soma + paraCentavos(linha[campo]);
  }, 0);
}

export function totais(
  linhas: readonly LinhaCustoReceita[],
): TotaisCustoReceita {
  const custoCentavos = somarCentavos(linhas, "total", "a_pagar");
  const receitaCentavos = somarCentavos(linhas, "total", "a_receber");
  const retencaoCentavos = somarCentavos(linhas, "retencao", "a_receber");
  const resultadoCentavos = receitaCentavos - custoCentavos;

  return {
    custo: paraReais(custoCentavos),
    receitaLiquida: paraReais(receitaCentavos),
    receitaFaturada: paraReais(receitaCentavos + retencaoCentavos),
    retencao: paraReais(retencaoCentavos),
    resultado: paraReais(resultadoCentavos),
    margem:
      receitaCentavos === 0
        ? null
        : (resultadoCentavos / receitaCentavos) * 100,
    movimentacaoEntrada: paraReais(
      somarCentavos(linhas, "total", "a_receber", "movimentacao"),
    ),
    movimentacaoSaida: paraReais(
      somarCentavos(linhas, "total", "a_pagar", "movimentacao"),
    ),
  };
}

export interface MesCustoReceita {
  /** yyyy-MM. */
  mes: string;
  custo: number;
  receita: number;
  resultado: number;
}

/** Um ponto por mês, em ordem crescente: é o eixo do gráfico. */
export function porMes(
  linhas: readonly LinhaCustoReceita[],
): MesCustoReceita[] {
  const porChave = new Map<string, { custo: number; receita: number }>();

  for (const linha of linhas) {
    // Só operacional: o gráfico é de custo x receita, e uma barra que somasse
    // empréstimo tomado mostraria um mês lucrativo que não foi.
    if (linha.natureza !== "operacional") continue;
    const atual = porChave.get(linha.mes) ?? { custo: 0, receita: 0 };
    const centavos = paraCentavos(linha.total);
    if (linha.tipo === "a_pagar") atual.custo += centavos;
    else atual.receita += centavos;
    porChave.set(linha.mes, atual);
  }

  return [...porChave.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, soma]) => ({
      mes,
      custo: paraReais(soma.custo),
      receita: paraReais(soma.receita),
      resultado: paraReais(soma.receita - soma.custo),
    }));
}

export interface CentroCustoReceita {
  centroCustoId: string;
  nome: string;
  codigo: string | null;
  total: number;
  retencao: number;
}

/**
 * Uma linha por centro do tipo pedido, do maior para o menor.
 *
 * O `tipo` é obrigatório de propósito: as duas tabelas da tela são de dinheiros
 * diferentes, e uma função que somasse os dois juntos por centro daria um número
 * que não significa nada.
 */
export function porCentro(
  linhas: readonly LinhaCustoReceita[],
  tipo: TipoCustoReceita,
  natureza: NaturezaCustoReceita = "operacional",
): CentroCustoReceita[] {
  const porId = new Map<
    string,
    { nome: string; codigo: string | null; total: number; retencao: number }
  >();

  for (const linha of linhas) {
    if (linha.tipo !== tipo) continue;
    if (linha.natureza !== natureza) continue;
    const atual = porId.get(linha.centroCustoId) ?? {
      nome: linha.nome,
      codigo: linha.codigo,
      total: 0,
      retencao: 0,
    };
    atual.total += paraCentavos(linha.total);
    atual.retencao += paraCentavos(linha.retencao);
    porId.set(linha.centroCustoId, atual);
  }

  return [...porId.entries()]
    .map(([centroCustoId, dados]) => ({
      centroCustoId,
      nome: dados.nome,
      codigo: dados.codigo,
      total: paraReais(dados.total),
      retencao: paraReais(dados.retencao),
    }))
    .sort((a, b) => b.total - a.total);
}
