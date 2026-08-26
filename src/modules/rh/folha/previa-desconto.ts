/**
 * Prévia do líquido, para o drawer mostrar o número ANTES de salvar. Sem React,
 * sem `use server`.
 *
 * Esta conta é uma SEGUNDA implementação da fórmula que vale de verdade
 * (`fn_editar_item_folha` no banco), e isso é deliberado: a tela precisa
 * responder enquanto a pessoa digita. O preço é que as duas podem divergir, e é
 * por isso que ela mora aqui, numa função pura com teste, em vez de inline no
 * componente — o teste é o que prende a prévia à fórmula do banco.
 *
 * Aqui morava também um `descontoDoSalario`, que aplicava o percentual sobre o
 * salário base. Ele saiu em 26/08/2026 junto com o percentual: o desconto passou
 * a ser digitado em reais, e não há mais o que derivar. Era exatamente essa
 * derivação que fazia 7,5% de R$ 1.621,00 virar R$ 121,58 na tela e no banco,
 * contra os R$ 121,57 do contracheque — 121,575 é a metade exata do centavo, e
 * nenhum arredondamento é "o certo" ali.
 *
 * A conversão entre HORAS não trabalhadas e valor mora em `horas-e-valor.ts`,
 * separada desta: aqui é a soma do líquido, lá é o atalho de digitação do
 * desconto. As duas são puras e testadas, e nenhuma das duas é a fonte da
 * verdade do dinheiro — quem grava é o banco.
 *
 * Tudo em centavos inteiros: dinheiro em ponto flutuante mente.
 */

/** Converte reais para centavos inteiros. */
function centavos(valor: number): number {
  return Math.round(valor * 100);
}

/** O que o colaborador recebe, depois de tudo que sai do salário dele. */
export interface ParcelasDoLiquido {
  salarioBase: number;
  gratificacao: number;
  /** Desconto por pessoa, em reais, como foi digitado nesta tela. */
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
