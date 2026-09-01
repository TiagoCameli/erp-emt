/**
 * Quanto de uma parcela paga pertence ao centro de custo que está filtrado.
 *
 * ## Por que existe
 *
 * O custo de um lançamento pode ser dividido entre vários centros (o rateio).
 * "REFERENTE COMPRA DE 3 CARRETAS - R$ 100.000,00" é UM pagamento repartido entre
 * três carretas. Filtrando por uma delas, mostrar os R$ 100.000,00 inteiros faz o
 * total de cada carreta contar o mesmo dinheiro de novo: medido em 01/09/2026, as
 * quatro carretas somavam R$ 3.281.796,24 contra R$ 1.475.272,77 do centro pai.
 * Escolha do Tiago no mesmo dia: com filtro de centro ligado, valor e total
 * passam a ser a FATIA daquele centro, e as partes fecham com o todo.
 *
 * É o mesmo `valorRecorte` que a listagem de Lançamentos já mostra. A diferença
 * é que lá a linha É o lançamento, e o rateio é do lançamento: o recorte é a soma
 * dos rateios da subárvore, exata, sem divisão nenhuma. Aqui a linha é a PARCELA,
 * então a fatia sai de uma divisão -- e é aí que dinheiro se perde.
 *
 * ## Por maior resto, não por arredondamento
 *
 * R$ 100.000,00 entre três dá 33.333,3333 para cada. Arredondando cada fatia por
 * conta própria, as três somam R$ 99.999,99 e o centavo que falta reaparece na
 * tela como "as partes não fecham" -- que é exatamente a queixa que originou este
 * módulo. Repartindo por maior resto, a soma das fatias é EXATAMENTE o total, e
 * isso vale em qualquer agrupamento: por carreta, por obra, no rodapé da tabela e
 * no card.
 *
 * Módulo puro: nada de banco, nada de React.
 */

/** Um rateio do lançamento: o centro e quanto dele. */
export interface RateioDoLancamento {
  centroCustoId: string;
  /** A parte do lançamento que é deste centro, em reais. */
  valor: number;
}

/** Reais para centavos inteiros. */
function centavos(valor: number): number {
  return Math.round(valor * 100);
}

/**
 * Reparte `total` centavos entre `pesos`, por maior resto.
 *
 * A soma do que sai é EXATAMENTE `total` — é essa a razão da função existir. Cada
 * parte recebe o piso da sua fração, e os centavos que sobram vão um a um para as
 * partes de maior resto (empate: a primeira da lista, para o resultado não
 * depender da ordem em que o banco devolveu as linhas).
 *
 * Peso zero recebe zero. Todos os pesos zero é rateio sem critério: o total
 * inteiro vai para a primeira parte, porque devolver zero em tudo APAGARIA
 * dinheiro do total da tela.
 */
export function ratearEmCentavos(
  total: number,
  pesos: readonly number[],
): number[] {
  if (pesos.length === 0) return [];

  const somaPesos = pesos.reduce((soma, peso) => soma + peso, 0);
  if (somaPesos <= 0) {
    return pesos.map((_, indice) => (indice === 0 ? total : 0));
  }

  const exatos = pesos.map((peso) => (total * peso) / somaPesos);
  const partes = exatos.map((exato) => Math.floor(exato));
  let sobra = total - partes.reduce((soma, parte) => soma + parte, 0);

  // Índices ordenados pelo resto, do maior para o menor. O índice desempata, para
  // a mesma entrada sempre sair igual.
  const porResto = exatos
    .map((exato, indice) => ({ indice, resto: exato - Math.floor(exato) }))
    .sort((a, b) => b.resto - a.resto || a.indice - b.indice);

  for (const { indice } of porResto) {
    if (sobra <= 0) break;
    partes[indice] += 1;
    sobra -= 1;
  }

  return partes;
}

/**
 * A fatia da parcela que pertence à subárvore filtrada, em reais.
 *
 * Reparte o valor da parcela entre TODOS os centros do rateio (é o rateio inteiro
 * que dá o denominador) e devolve a soma das fatias que caíram dentro da
 * subárvore. Lançamento dividido entre uma carreta e o Escritório entra só com a
 * parte da carreta.
 *
 * Sem rateio nenhum devolve zero, e não o valor cheio: parcela sem rateio não
 * pertence a centro nenhum, então não pertence a este recorte -- e ela nem chega
 * aqui, porque o filtro de centro exige um rateio que bata.
 */
export function recorteDaParcela(
  valorEmReais: number,
  rateios: readonly RateioDoLancamento[],
  subarvore: ReadonlySet<string>,
): number {
  if (rateios.length === 0) return 0;

  const fatias = ratearEmCentavos(
    centavos(valorEmReais),
    rateios.map((rateio) => centavos(rateio.valor)),
  );

  let dentro = 0;
  for (const [indice, rateio] of rateios.entries()) {
    if (subarvore.has(rateio.centroCustoId)) dentro += fatias[indice];
  }
  return dentro / 100;
}
