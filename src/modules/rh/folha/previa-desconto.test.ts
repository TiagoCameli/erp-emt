/**
 * A prévia do líquido tem que dar o MESMO número que o banco grava.
 *
 * A âncora é o caso real que originou a mudança de percentual para valor:
 * CLELTON PEREIRA DE OLIVEIRA, salário base R$ 1.621,00, gratificação R$ 286,00,
 * desconto de R$ 121,57 — o valor do contracheque. Medido na
 * `fn_editar_item_folha` do projeto vivo em 26/08/2026: desconto 121,57, líquido
 * 1.785,43.
 *
 * O NÚMERO ANTIGO ESTÁ AQUI DE PROPÓSITO. Enquanto o desconto era um percentual,
 * 7,5% de R$ 1.621,00 dava 121,575, o `round()` do banco subia para R$ 121,58 e
 * o líquido saía R$ 1.785,42 — um centavo a menos do que o contracheque paga.
 * O teste que segura a diferença é o "um centavo importa" mais abaixo: se alguém
 * reintroduzir a conta por percentual, ele quebra com a diferença nomeada em vez
 * de a folha voltar a divergir calada.
 *
 * Note que já não existe função de desconto para testar: o valor digitado É o
 * desconto. O que resta de conta é o líquido.
 */
import { describe, expect, it } from "vitest";

import { liquidoPrevisto } from "@/modules/rh/folha/previa-desconto";

const SALARIO = 1621;
const GRATIFICACAO = 286;
/** O valor do contracheque, digitado. */
const DESCONTO = 121.57;
/** O que o banco gravou de líquido com esse desconto. */
const LIQUIDO_REAL = 1785.43;
/** O que a era do percentual produzia: 7,5% arredondado para cima. */
const DESCONTO_ANTIGO = 121.58;

const semOutrosDescontos = {
  inss: 0,
  irrf: 0,
  adiantamentos: 0,
};

describe("o caso do CLELTON fecha com o banco", () => {
  it("com o desconto do contracheque, o líquido dá os R$ 1.785,43 gravados", () => {
    expect(
      liquidoPrevisto({
        salarioBase: SALARIO,
        gratificacao: GRATIFICACAO,
        desconto: DESCONTO,
        ...semOutrosDescontos,
      }),
    ).toBe(LIQUIDO_REAL);
  });

  it("LINHA DE CONTROLE: sem desconto, o líquido é o bruto inteiro", () => {
    // Se esta linha desse 1.785,43 também, o teste acima estaria passando por
    // acidente — e o desconto não estaria saindo de lugar nenhum.
    expect(
      liquidoPrevisto({
        salarioBase: SALARIO,
        gratificacao: GRATIFICACAO,
        desconto: 0,
        ...semOutrosDescontos,
      }),
    ).toBe(1907);
  });

  it("um centavo importa: o valor antigo dá um líquido DIFERENTE", () => {
    // É a mudança inteira num teste. R$ 121,58 (o percentual arredondado) e
    // R$ 121,57 (o contracheque) não podem dar o mesmo líquido — se derem, a
    // prévia está arredondando por conta própria e o centavo que motivou toda
    // esta frente voltou.
    const comAntigo = liquidoPrevisto({
      salarioBase: SALARIO,
      gratificacao: GRATIFICACAO,
      desconto: DESCONTO_ANTIGO,
      ...semOutrosDescontos,
    });
    expect(comAntigo).toBe(1785.42);
    expect(comAntigo).not.toBe(LIQUIDO_REAL);
    expect(LIQUIDO_REAL - comAntigo).toBeCloseTo(0.01, 10);
  });
});

describe("o valor digitado entra inteiro, sem conta nenhuma", () => {
  it("o desconto sai do líquido pelo valor exato, com 2 casas quaisquer", () => {
    // Nenhum destes é 7,5% de nada: é o ponto. Qualquer centavo que o
    // contracheque disser tem de atravessar a tela intacto.
    expect(
      liquidoPrevisto({
        salarioBase: 1000,
        gratificacao: 0,
        desconto: 0.01,
        ...semOutrosDescontos,
      }),
    ).toBe(999.99);
    expect(
      liquidoPrevisto({
        salarioBase: 1000,
        gratificacao: 0,
        desconto: 333.33,
        ...semOutrosDescontos,
      }),
    ).toBe(666.67);
  });

  it("desconto igual ao salário base deixa só a gratificação", () => {
    expect(
      liquidoPrevisto({
        salarioBase: SALARIO,
        gratificacao: GRATIFICACAO,
        desconto: SALARIO,
        ...semOutrosDescontos,
      }),
    ).toBe(GRATIFICACAO);
  });

  it("soma sem erro de ponto flutuante", () => {
    // 0,1 + 0,2 em float não é 0,3. O líquido passa por seis somas de dinheiro.
    expect(
      liquidoPrevisto({
        salarioBase: 0.1,
        gratificacao: 0.2,
        desconto: 0,
        ...semOutrosDescontos,
      }),
    ).toBe(0.3);
  });
});

describe("o líquido não fica negativo", () => {
  it("desconto maior que o disponível para em zero, não em negativo", () => {
    // O banco recusa a gravação nesse caso, com uma mensagem que manda regerar.
    // A prévia mostrando R$ 0,00 é o aviso de que o valor não vai ser aceito.
    expect(
      liquidoPrevisto({
        salarioBase: 1000,
        gratificacao: 0,
        desconto: 1000,
        inss: 0,
        irrf: 0,
        adiantamentos: 500,
      }),
    ).toBe(0);
  });

  it("LINHA DE CONTROLE: quando cabe, o número passa inteiro", () => {
    // Mesmo adiantamento de R$ 500, desconto que cabe: 1.000 − 50 − 500 = 450.
    expect(
      liquidoPrevisto({
        salarioBase: 1000,
        gratificacao: 0,
        desconto: 50,
        inss: 0,
        irrf: 0,
        adiantamentos: 500,
      }),
    ).toBe(450);
  });
});

describe("INSS e IRRF continuam saindo do líquido", () => {
  it("os três descontos se somam", () => {
    // Salário 5.000, INSS 500, IRRF 300, desconto por pessoa 250.
    expect(
      liquidoPrevisto({
        salarioBase: 5000,
        gratificacao: 0,
        desconto: 250,
        inss: 500,
        irrf: 300,
        adiantamentos: 0,
      }),
    ).toBe(3950);
  });
});
