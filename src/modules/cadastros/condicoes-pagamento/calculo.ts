/**
 * Cálculo puro de condições de pagamento: divisão do valor em parcelas e
 * datas de vencimento. Sem I/O, reusado pelo cadastro (Task 4) e pelo
 * recebimento/gerador de parcelas de OC (Task 6).
 */

/**
 * Divide valorTotal pelos percentuais (2 casas); a última parcela absorve o
 * resto para a soma fechar exatamente com valorTotal.
 */
export function dividirValorPorParcelas(
  valorTotal: number,
  percentuais: number[],
): number[] {
  const centavos = Math.round(valorTotal * 100);
  const valores = percentuais.map((p) => Math.round((centavos * p) / 100));
  const somaMenosUltima = valores.slice(0, -1).reduce((a, b) => a + b, 0);
  valores[valores.length - 1] = centavos - somaMenosUltima;
  return valores.map((c) => c / 100);
}

/**
 * Divide 100% igualmente entre n parcelas (2 casas); a última parcela absorve
 * o resto do arredondamento para a soma fechar exatamente em 100.00.
 */
export function dividirPercentualIgual(n: number): number[] {
  if (n <= 0) return [];
  const centavos = Math.floor(10000 / n);
  const percentuais = new Array(n).fill(centavos / 100);
  const somaMenosUltima = centavos * (n - 1);
  percentuais[n - 1] = (10000 - somaMenosUltima) / 100;
  return percentuais;
}

/** Datas de vencimento = dataBase (ISO yyyy-mm-dd) + cada offset em dias. */
export function datasParcelas(
  dataBaseISO: string,
  diasOffsets: number[],
): string[] {
  return diasOffsets.map((dias) => {
    const d = new Date(`${dataBaseISO}T00:00:00`);
    d.setDate(d.getDate() + dias);
    return d.toISOString().slice(0, 10);
  });
}
