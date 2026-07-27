/**
 * Lógica PURA de cálculo de INSS e IRRF da folha (Bloco 7). Funções sem I/O,
 * sem `use server`: recebem as faixas e parâmetros como argumentos (o Tiago os
 * cadastra em `folha_inss_faixas`, `folha_irrf_faixas` e `folha_parametros`) e
 * devolvem o valor em reais. Nenhuma alíquota é chumbada aqui — só o método.
 *
 * Convenção de `aliquota`: percentual (0–100), igual ao banco
 * (`numeric(6,3)`) e ao resto do ERP (`* percentual / 100`). O cálculo divide
 * por 100. `limiteAte` e `parcelaDeduzir` são valores em reais.
 */

/** Faixa progressiva do INSS: alíquota aplicada até `limiteAte`. */
export type FaixaInss = { limiteAte: number; aliquota: number };

/** Faixa do IRRF mensal: alíquota + parcela a deduzir, até `limiteAte`. */
export type FaixaIrrf = {
  limiteAte: number;
  aliquota: number;
  parcelaDeduzir: number;
};

/** Arredonda em 2 casas (dinheiro é NUMERIC(14,2) no banco). */
function arredondar2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * INSS progressivo com teto. Ordena as faixas por `limiteAte` crescente e, para
 * cada faixa, aplica a alíquota SÓ sobre a porção do salário DENTRO dela (entre
 * o limite anterior e `limiteAte`). Acima do maior `limiteAte` (teto) a
 * contribuição trava: não há faixa além, então nada mais soma. Faixas vazias
 * → 0. Resultado em 2 casas.
 *
 * Ex.: faixas [até 1000 @7,5%, até 2000 @9%]; salário 1500 →
 * 1000×7,5% + 500×9% = 120,00; salário 3000 → 1000×7,5% + 1000×9% = 165,00
 * (travado no teto 2000).
 */
export function calcularINSS(salario: number, faixas: FaixaInss[]): number {
  if (faixas.length === 0) return 0;

  const ordenadas = [...faixas].sort((a, b) => a.limiteAte - b.limiteAte);

  let contribuicao = 0;
  let limiteAnterior = 0;
  for (const faixa of ordenadas) {
    if (salario <= limiteAnterior) break;
    const topo = Math.min(salario, faixa.limiteAte);
    const porcao = topo - limiteAnterior;
    if (porcao > 0) {
      contribuicao += porcao * (faixa.aliquota / 100);
    }
    limiteAnterior = faixa.limiteAte;
  }

  return arredondar2(contribuicao);
}

/**
 * Faixa aplicável do IRRF para uma base: a PRIMEIRA cujo `limiteAte` >= base
 * (as faixas já vêm ordenadas por `limiteAte` crescente); se a base for maior
 * que todos os limites, usa a ÚLTIMA faixa (a "acima de X" da tabela
 * progressiva do IRRF mensal). Pressupõe `faixas.length > 0`.
 */
function faixaAplicavelIrrf(
  base: number,
  faixasOrdenadas: FaixaIrrf[],
): FaixaIrrf {
  for (const faixa of faixasOrdenadas) {
    if (base <= faixa.limiteAte) return faixa;
  }
  return faixasOrdenadas[faixasOrdenadas.length - 1];
}

/**
 * Imposto do IRRF sobre uma base já calculada: acha a faixa, aplica
 * `base × alíquota − parcelaDeduzir` e nunca devolve negativo. Base negativa é
 * tratada como 0 (sem imposto). Faixas vazias → 0. Resultado em 2 casas.
 */
function impostoIrrf(base: number, faixas: FaixaIrrf[]): number {
  if (faixas.length === 0) return 0;

  const baseEfetiva = Math.max(0, base);
  const ordenadas = [...faixas].sort((a, b) => a.limiteAte - b.limiteAte);
  const faixa = faixaAplicavelIrrf(baseEfetiva, ordenadas);
  const imposto = baseEfetiva * (faixa.aliquota / 100) - faixa.parcelaDeduzir;

  return arredondar2(Math.max(0, imposto));
}

/**
 * IRRF pelo modelo COMPLETO (deduções legais): base = salário − INSS −
 * (qtdDependentes × dedução por dependente). Aplica a tabela do IRRF sobre
 * essa base. Base negativa ou faixa isenta → 0.
 */
export function calcularIRRFCompleto(
  salario: number,
  inss: number,
  qtdDependentes: number,
  faixas: FaixaIrrf[],
  deducaoPorDependente: number,
): number {
  const base = salario - inss - qtdDependentes * deducaoPorDependente;
  return impostoIrrf(base, faixas);
}

/**
 * IRRF pelo modelo SIMPLIFICADO (desconto único): base = salário − desconto
 * simplificado. Mesma tabela de faixas. Base negativa ou faixa isenta → 0.
 */
export function calcularIRRFSimplificado(
  salario: number,
  faixas: FaixaIrrf[],
  descontoSimplificado: number,
): number {
  const base = salario - descontoSimplificado;
  return impostoIrrf(base, faixas);
}

/**
 * IRRF final = o MENOR entre o completo e o simplificado (o contribuinte fica
 * com o desconto mais vantajoso).
 */
export function calcularIRRF(
  salario: number,
  inss: number,
  qtdDependentes: number,
  faixas: FaixaIrrf[],
  deducaoPorDependente: number,
  descontoSimplificado: number,
): number {
  const completo = calcularIRRFCompleto(
    salario,
    inss,
    qtdDependentes,
    faixas,
    deducaoPorDependente,
  );
  const simplificado = calcularIRRFSimplificado(
    salario,
    faixas,
    descontoSimplificado,
  );
  return Math.min(completo, simplificado);
}
