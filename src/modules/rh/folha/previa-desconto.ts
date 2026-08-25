/**
 * Prévia do desconto de salário e do líquido, para o drawer mostrar o número
 * ANTES de salvar. Sem React, sem `use server`.
 *
 * Estas contas são uma SEGUNDA implementação das fórmulas que valem de verdade
 * (`fn_editar_item_folha` no banco), e isso é deliberado: a tela precisa
 * responder enquanto a pessoa digita. O preço é que as duas podem divergir, e é
 * por isso que elas moram aqui, numa função pura com teste, em vez de inline no
 * componente — o teste é o que prende a prévia à fórmula do banco.
 *
 * Tudo em centavos inteiros: dinheiro em ponto flutuante mente.
 */

/** Converte reais para centavos inteiros. */
function centavos(valor: number): number {
  return Math.round(valor * 100);
}

/**
 * Quanto sai do salário. Incide sobre o SALÁRIO BASE, sem gratificação — mesma
 * base do `fn_editar_item_folha` e da provisão.
 *
 * `null` (sem desconto) e `0` (desconto de zero) dão os dois R$ 0,00. A
 * diferença entre eles é o que se GRAVA, não o que se desconta.
 */
export function descontoDoSalario(
  salarioBase: number,
  percentual: number | null,
): number {
  if (percentual === null) return 0;
  // Divide por 100 (o percentual) ANTES de arredondar, e só então volta para
  // reais. Arredondar depois da divisão por 10.000 devolvia 121,575 em vez de
  // 121,58 — um centavo de diferença entre a tela e o `round(...,2)` do banco,
  // exatamente no número que a pessoa está conferindo.
  return Math.round((centavos(salarioBase) * percentual) / 100) / 100;
}

/** O que o colaborador recebe, depois de tudo que sai do salário dele. */
export interface ParcelasDoLiquido {
  salarioBase: number;
  gratificacao: number;
  /** Desconto por pessoa (o percentual desta tela). */
  desconto: number;
  /** INSS retido, calculado pelas faixas no banco. */
  inss: number;
  /** IRRF retido, calculado pelas faixas no banco. */
  irrf: number;
  /** Adiantamento já descontado nesta folha. */
  adiantamentos: number;
}

/**
 * Líquido previsto: bruto menos tudo que sai do salário.
 *
 * NÃO deixa passar de zero para baixo. Líquido negativo é estado impossível (o
 * colaborador devendo para a folha), e o banco recusa a gravação nesse caso com
 * uma mensagem que manda regerar — a prévia mostrar R$ 0,00 é o aviso visual de
 * que o valor digitado não vai ser aceito.
 */
export function liquidoPrevisto(parcelas: ParcelasDoLiquido): number {
  const total =
    centavos(parcelas.salarioBase) +
    centavos(parcelas.gratificacao) -
    centavos(parcelas.desconto) -
    centavos(parcelas.inss) -
    centavos(parcelas.irrf) -
    centavos(parcelas.adiantamentos);
  return Math.max(total, 0) / 100;
}
