/**
 * Cálculo puro do mapa comparativo de cotação. Sem React, sem 'use server':
 * a tela (mapa-comparativo.tsx) importa daqui e os testes cobrem a regra.
 *
 * Mapa: linhas = insumos, colunas = fornecedores. Cada célula é o preço
 * unitário de um fornecedor para um insumo. O total de um fornecedor é a soma
 * de preço x quantidade dos insumos que ele cotou. Destaca o menor preço por
 * linha e o menor total por coluna.
 */

/**
 * Converte texto digitado ("1.234,56" ou "1234.56") em número. Trata o ponto
 * como separador de milhar e a vírgula como decimal (padrão pt-BR). Vazio ou
 * inválido vira 0, nunca NaN, para o cálculo não contaminar.
 */
export function paraNumero(texto: string): number {
  const limpo = texto.trim().replace(/\./g, "").replace(",", ".");
  if (limpo === "") return 0;
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : 0;
}

/** Uma linha do mapa: o insumo, a quantidade cotada e o preço por fornecedor. */
export interface LinhaComparativo {
  insumoId: string;
  /** Quantidade como número já coerido. */
  quantidade: number;
  /** Preço unitário por id de fornecedor da cotação. */
  precos: Record<string, number>;
}

/** Resultado do comparativo, pronto para a tela destacar os menores. */
export interface ResultadoComparativo {
  /** Total (preço x quantidade) por id de fornecedor. Só fornecedores com preço. */
  totalPorFornecedor: Map<string, number>;
  /** Menor preço unitário por insumoId, considerando só preços maiores que zero. */
  menorPorLinha: Map<string, number>;
  /** Menor total entre os fornecedores; null quando ninguém cotou nada. */
  menorTotal: number | null;
}

/**
 * Monta o comparativo a partir das linhas e da lista de fornecedores. Só conta
 * preços maiores que zero (célula em branco = fornecedor não cotou aquele item),
 * então um fornecedor que não cotou nada não entra em totalPorFornecedor.
 */
export function montarComparativo(
  linhas: LinhaComparativo[],
  fornecedorIds: string[],
): ResultadoComparativo {
  const totalPorFornecedor = new Map<string, number>();
  const menorPorLinha = new Map<string, number>();

  for (const linha of linhas) {
    let menor = Number.POSITIVE_INFINITY;
    for (const fornecedorId of fornecedorIds) {
      const preco = linha.precos[fornecedorId] ?? 0;
      if (preco > 0) {
        totalPorFornecedor.set(
          fornecedorId,
          (totalPorFornecedor.get(fornecedorId) ?? 0) + preco * linha.quantidade,
        );
        if (preco < menor) menor = preco;
      }
    }
    if (menor !== Number.POSITIVE_INFINITY) {
      menorPorLinha.set(linha.insumoId, menor);
    }
  }

  let menorTotal = Number.POSITIVE_INFINITY;
  for (const total of totalPorFornecedor.values()) {
    if (total > 0 && total < menorTotal) menorTotal = total;
  }

  return {
    totalPorFornecedor,
    menorPorLinha,
    menorTotal: menorTotal === Number.POSITIVE_INFINITY ? null : menorTotal,
  };
}
